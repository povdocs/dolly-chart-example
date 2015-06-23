(function () {
	'use strict';

	//dependencies
	var Dolly = require('dolly');
	var xhr = require('d3-xhr').xhr;
	var binarySearch = require('binary-search');
	var format = require('simple-number-formatter');

	var PERIOD = 1;//1000 * 60 * 60 * 24 * 7;
	var dpr = window.devicePixelRatio || 1;

	//state
	var dolly = new Dolly();
	var lastTime = 0;
	var data;
	var noteData = [];
	var playRate = 1;
	var lastResize = -1;
	var resizeTimeout;
	var playing = false;
	var camera;
	var player;
	var timeline;
	var activeButtons = {
		leftKey: false,
		rightKey: false
	};

	var max = {}, min = {};

	var ctx = document.getElementById('canvas').getContext('2d');
	var period = document.getElementById('period');
	var value = document.getElementById('value');
	var notes = document.getElementById('notes');
	var infobutton = document.getElementById('infobutton');
	var info = document.getElementById('info');
	var controls = document.getElementById('controls');

	//config
	var field = 'immigrants';
	var dataFile = 'data/immigration.tsv';
	var colors = {
		bg: '#333333',
		line: 'rgb(63, 113, 190)',
		fill: 'rgba(63, 113, 190, 0.3)',
		grid: '#666',
		text: '#ffffff',
		player: '#ff0000',
		note: '#dddddd'
	};
	var dim = {
		speed: 50, //periods per second, left or right
		chartLine: 1,
		iconSize: 20,
		scale: 1 * dpr, //canvas pixels per "world" unit
		player: 3,
		vPadding: 10,
		gridLine: 1,
		noteLine: 2,
		gridSpacing: 20, //distance between x axis grid lines
		x: 8, //distance per period on x axis
		y: 1 / 4000, //distance per $ on y axis
		z: 5 //default zoom level
	};

	function resize() {
		var width,
			height,
			marginX,
			marginY;

		//throttle to one resize every 100ms
		clearTimeout(resizeTimeout);
		if (Date.now() - lastResize < 100) {
			resizeTimeout = setTimeout(resize);
			return;
		}

		width = window.innerWidth;
		height = window.innerHeight;

		height -= controls.offsetHeight;

		ctx.canvas.width = width;
		ctx.canvas.height = height;

		/*
		set min/max of camera based on zoom
		*/
		marginX = width / (dim.z * dim.scale) / 2;
		marginY = height / (dim.z * dim.scale) / 2;
		camera.minBounds.x = marginX;
		camera.minBounds.y = marginY;
		camera.maxBounds.x = max.x - marginX;
		camera.maxBounds.y = (max[field] - min[field]) * dim.y - marginY + dim.vPadding * 2;


		draw();
		lastResize = Date.now();
	}

	function comparePoints(a, b) {
		return a.date - b.date;
	}

	/*
	Converts from date/value to x/y in "world" space
	*/
	function pointToX(point) {
		//convert date to period # before scaling
		var period = (point.date - min.date) / PERIOD;
		return period * dim.x;
	}

	function pointToY(point) {
		return (point[field] - min[field]) * dim.y + dim.vPadding;
	}

	/*
	Given date, find the nearest data point
	*/
	function findPoint(list, date) {
		var index = binarySearch(list, {
			date: date
		}, comparePoints);//, lo, hi);

		/*
		Negative result is bitwise complement of the index of the first element
		that is larger than value */
		if (index < 0) {
			return (~index) - 1; //jshint ignore: line
		}

		return index;
	}

	function nearestPoint(x) {
		var date = Math.floor(x / dim.x * PERIOD) + min.date;
		return findPoint(data, date);
	}

	function interpolate(x, point, next) {
		var lowX = pointToX(point),
			highX,
			y = pointToY(point),
			partial;

		//interpolate
		if (x > lowX && next) {
			highX = pointToX(next);
			partial = (x - lowX) / (highX - lowX);
			y = (1 - partial) * y + partial * pointToY(next);
		}

		return y;
	}

	function draw() {
		var width = ctx.canvas.width,
			height = ctx.canvas.height;

		//calculate "camera" values
		var scale = camera.position.z * dim.scale;
		var worldWidth = width * scale / camera.position.z;
		var worldHeight = height * scale / camera.position.z;
		var minWorldX = camera.position.x - worldWidth / 2;
		var maxWorldX = minWorldX + worldWidth;
		var minWorldY = camera.position.y - worldHeight / 2;
		var maxWorldY = minWorldY + worldHeight;

		var i;
		var lo, hi;
		var x, y;
		var point;

		/*
		Convert from "world" space to canvas space
		*/
		function canvasX(x) {
			//todo: add margin
			return (x - camera.position.x) * scale + width / 2;
		}

		function canvasY(y) {
			//todo: add margin
			return height - ((y - camera.position.y) * scale + height / 2);
		}

		//clear
		ctx.fillStyle = colors.bg;
		ctx.fillRect(0, 0, width, height);

		lo = nearestPoint(Math.max(0, minWorldX));
		hi = nearestPoint(maxWorldX) + 1;

		//todo: draw x/y axes

		//draw grid lines
		//todo: align with years
		ctx.strokeStyle = colors.grid;
		ctx.lineWidth = dim.gridLine;
		ctx.beginPath();

		//horizontal grid lines
		i = Math.ceil(pointToX(data[lo]) / dim.gridSpacing) * dim.gridSpacing;
		while (i < maxWorldX) {
			x = canvasX(i);
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			i += dim.gridSpacing;
		}

		//vertical grid lines
		i = Math.ceil(minWorldY / dim.gridSpacing) * dim.gridSpacing;
		while (i < maxWorldY) {
			y = canvasY(i);
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			i += dim.gridSpacing;
		}
		ctx.stroke();

		//note markers
		ctx.strokeStyle = colors.note;
		ctx.lineWidth = dim.noteLine;
		ctx.beginPath();
		noteData.forEach(function (note) {
			var i = findPoint(data, note.date),
				point = data[i],
				x = pointToX(point),
				y = interpolate(x, point, data[i + 1]);

			x = canvasX(x);
			y = canvasY(y);
			ctx.moveTo(x, y);
			ctx.lineTo(x, height);
		});
		ctx.stroke();

		//draw line
		ctx.strokeStyle = colors.line;
		ctx.lineWidth = dim.chartLine;
		ctx.beginPath();
		for (i = lo; i < hi; i++) {
			point = data[i];
			x = canvasX(pointToX(point));
			y = canvasY(pointToY(point));

			if (i) {
				ctx.lineTo(x, y);
			} else {
				ctx.moveTo(x, y);
			}
		}
		ctx.stroke();

		//fill under graph
		ctx.fillStyle = colors.fill;
		ctx.lineTo(x, height * dim.scale);
		ctx.lineTo(0, height * dim.scale);
		ctx.fill();

		//draw player
		ctx.fillStyle = colors.player;
		ctx.beginPath();
		ctx.arc(canvasX(player.position.x), canvasY(player.position.y), dim.player * dim.scale, 0, Math.PI * 2);
		ctx.fill();

		ctx.restore();
	}

	function animate() {
		var now = Date.now(),
			delta = Math.min(500, (Date.now() - lastTime) / 1000),
			moving;

		function updatePlayer() {
			var i,
				point,
				next,
				direction = 0,
				x,
				x1, x2,
				y1, y2,
				speed;

			x = player.position.x;

			//move left or right
			if (activeButtons.leftKey || activeButtons.skipBackward) {
				direction -= 1;
			}
			if (activeButtons.rightKey || activeButtons.skipForward) {
				direction += 1;
			}
			if (!direction && playing) {
				direction = 1;
			}

			i = nearestPoint(x);
			point = data[i];

			if (direction) {
				/*
				Adjust speed for slope so the "player" moves at a constant rate
				regardless of whether it moves up or down.
				*/
				if (i) {
					next = data[Math.max(0, Math.min(data.length - 1, i + direction))];
				} else {
					next = data[1];
				}
				x1 = pointToX(point);
				x2 = pointToX(next);
				y1 = pointToY(point);
				y2 = pointToY(next);
				speed = dim.x / Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));

				x += dim.speed * speed * delta * direction;

				//keep from going off the edge of the screen
				x = Math.min(max.x, Math.max(min.x, x));

				player.position.x = x;
			}

			player.position.y = interpolate(x, point, data[i + 1]);

			//display stats
			period.textContent = point.date;
			value.textContent = format(point[field], '0,0', { thousandsDelimeter: ',' });

			return !!direction;
		}

		moving = updatePlayer();
		dolly.update(delta);

		if (moving || dolly.active(0.001)) {
			// don't draw if no updates
			draw();
		}

		lastTime = now;

		requestAnimationFrame(animate);
	}

	function loadNotes() {
		xhr('data/notes.tsv', function(response) {
			var tsv = response.responseText.trim().split('\n');
			var fields = tsv.shift().split('\t');
			var activeAttractors = {};

			function updateAttractor(prop, subject, amount) {
				var k;
				var attraction = 0;
				var att;

				if (amount) {
					activeAttractors[subject.id] = amount;
				} else {
					delete activeAttractors[subject.id];
				}

				for (k in activeAttractors) {
					if (activeAttractors.hasOwnProperty(k)) {
						att = activeAttractors[k];
						attraction = Math.max(attraction, att);
					}
				}

				//slight slowdown in playback rate when close to points of interest
				playRate = 1 - attraction * 0.5;
			}

			noteData = tsv.map(function (line) {
				return line.split('\t')
					.reduce(function (prev, str, i) {
						var field = fields[i];
						var val = parseFloat(str);
						var date = Date.parse(str);
						if (isNaN(val)) {
							if (date > 0) {
								val = date;
							} else {
								val = str;
							}
						}

						prev[field] = val;
						return prev;
					}, Object.create(null));
			});
			noteData.forEach(function (note) {
				var lo = findPoint(data, note.start);
				var hi = Math.min(data.length, findPoint(data, note.end) + 1);
				var minY = Infinity;
				var maxY = -Infinity;
				var minX = pointToX(data[lo]);
				var maxX = pointToX(data[hi - 1]);
				var i;
				var y;
				var point;

				for (i = lo; i < hi; i++) {
					point = data[i];
					y = pointToY(point);
					minY = Math.min(minY, y);
					maxY = Math.max(maxY, y);
				}

				//create attractor
				var attractor = dolly.prop({
					name: note.date,
					position: [(minX + maxX) / 2, 0, 0]
				});

				camera.attract(timeline, attractor, {
					offset: [0, (minY + maxY) / 2, note.zoom],
					innerRadius: (maxX - minX) / 2,
					outerRadius: 1.2 * (maxX - minX) / 2
				});

				var div = document.createElement('div');
				div.style.display = 'none';
				notes.appendChild(div);
				note.note
					.split('\n')
					.forEach(function (paragraph) {
						var p = document.createElement('p');
						p.textContent = paragraph;
						div.appendChild(p);
					});

				camera.on('enterattractor', function (prop, subject) {
					if (subject === attractor) {
						div.style.display = '';
					}
				});
				camera.on('leaveattractor', function (prop, subject) {
					if (subject === attractor) {
						div.style.display = 'none';
					}
				});
			});

			camera.on('enterattractor', updateAttractor);
			camera.on('moveattractor', updateAttractor);
			camera.on('leaveattractor', updateAttractor);

			draw();
		});
	}

	function buildInterface() {
		var buttons = {
				'pause': require('raw!open-iconic/svg/media-pause.svg'),
				'play': require('raw!open-iconic/svg/media-play.svg'),
				'stepBackward': require('raw!open-iconic/svg/media-step-backward.svg'),
				'skipBackward': require('raw!open-iconic/svg/media-skip-backward.svg'),
				'skipForward': require('raw!open-iconic/svg/media-skip-forward.svg'),
				'stepForward': require('raw!open-iconic/svg/media-step-forward.svg')
			};

		//interface functions

		function play() {
			playing = true;
			buttons.play.classList.add('hidden');
			buttons.pause.classList.remove('hidden');
		}

		function pause() {
			playing = false;
			buttons.play.classList.remove('hidden');
			buttons.pause.classList.add('hidden');
		}

		function keyDown(evt) {
			switch (evt.keyCode) {
				case 37: //left
				case 65: //a
					activeButtons.leftKey = true;
					pause();
					break;
				case 39: //right
				case 68: //d
					activeButtons.rightKey = true;
					pause();
					break;
			}
		}

		function keyUp(evt) {
			switch (evt.keyCode) {
				case 37: //left
				case 65: //a
					activeButtons.leftKey = false;
					break;
				case 39: //right
				case 68: //d
					activeButtons.rightKey = false;
					break;
				case 32: //space
					if (playing) {
						pause();
					} else {
						play();
					}
			}
		}

		function buttonDown(button, name) {
			pause();
			button.classList.add('active');
			activeButtons[name] = true;
		}

		function buttonUp(button, name) {
			button.classList.remove('active');
			activeButtons[name] = false;
		}

		function stepBack() {
			var date = Math.floor(player.position.x / dim.x * PERIOD) + min.date,
				i = findPoint(noteData, date),
				x;

			if (i < 0) {
				return;
			}

			x = pointToX(noteData[i]);
			if (i && player.position.x - x < 0.1) {
				i--;
				x = pointToX(noteData[i]);
			}
			player.position.x = x;
		}

		function stepNext() {
			var date = Math.floor(player.position.x / dim.x * PERIOD) + min.date,
				i = findPoint(noteData, date) + 1;

			if (i < noteData.length) {
				player.position.x = pointToX(noteData[i]);
			}
		}

		//buttons
		Object.keys(buttons).forEach(function (key) {
			var span = document.createElement('span'),
				svg;

			span.innerHTML = buttons[key];
			span.id = key;
			svg = span.firstChild;
			svg.setAttribute('width', dim.iconSize);
			svg.setAttribute('height', dim.iconSize);

			span.addEventListener('mousedown', buttonDown.bind(null, span, key), false);
			span.addEventListener('mouseup', buttonUp.bind(null, span, key), false);
			span.addEventListener('mouseup', buttonUp.bind(null, span, key), false);

			controls.appendChild(span);
			buttons[key] = span;
		});

		buttons.pause.className = 'hidden';
		buttons.stepBackward.addEventListener('click', stepBack, false);
		buttons.stepForward.addEventListener('click', stepNext, false);
		buttons.play.addEventListener('click', play, false);
		buttons.pause.addEventListener('click', pause, false);

		infobutton.addEventListener('click', function () {
			if (info.className) {
				info.className = '';
			} else {
				info.className = 'open';
			}
		});

		//keyboard
		document.addEventListener('keydown', keyDown, false);
		document.addEventListener('keyup', keyUp, false);
	}

	xhr(dataFile, function(response) {
		var tsv = response.responseText.split('\n');
		var fields = tsv.shift().split('\t');

		fields.forEach(function (field) {
			min[field] = Infinity;
			max[field] = -Infinity;
		});

		data = tsv.map(function (line) {
			return line.split('\t')
				.reduce(function (prev, str, i) {
					var field = fields[i];
					var val = parseFloat(str);
					var date = Date.parse(str);
					if (isNaN(val) && date > 0) {
						val = date;
					}

					max[field] = Math.max(max[field], val);
					min[field] = Math.min(min[field], val);

					prev[field] = val;
					return prev;
				}, Object.create(null));
			})
			.sort(comparePoints);

		var first = data[0];
		var last = data[data.length - 1];
		min.x = pointToX(first);
		max.x = pointToX(last);

		/*
		Now that data has been processed, set up the rest of the scene
		*/
		player = dolly.prop({
			name: 'player',
			// position: [max.x, pointToY(last), 0]
			position: [min.x, pointToY(first), 0]
		});

		camera = dolly.prop({
			name: 'camera',
			position: [player.position.x, player.position.y, dim.z],
			lag: 0.85
		});

		/*
		A separate prop for timeline that follows the player along the x
		axis, so the attractor is not affected by distance along the y axis
		*/
		timeline = dolly.prop({
			name: 'timeline',
			position: [player.position.x, 0, 0],
			minBounds: [0, 0, 0],
			maxBounds: [Infinity, 0, 0]
		});

		camera.follow(player, {
			offset: [0, 0, dim.z],
			radius: 6
		});

		timeline.follow(player, {
			lag: 0
		});

		loadNotes();
		buildInterface();

		resize();
		animate();
	});

	window.addEventListener('resize', resize, false);
}());