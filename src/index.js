(function () {
	'use strict';

	//dependencies
	var Dolly = require('dolly');
	var xhr = require('d3-xhr');
	var binarySearch = require('binary-search');
	var format = require('simple-number-formatter');

	var PERIOD = 1;//1000 * 60 * 60 * 24 * 7;
	var dpr = window.devicePixelRatio || 1;

	//state
	var dolly = new Dolly();
	var lastTime = 0;
	var data;
	var previous = {
		x: -1,
		y: -1,
		z: -1
	};
	var camera;
	var player;
	var timeline;
	var buttons = {
		left: false,
		right: false,
		leftKey: false,
		rightKey: false
	};

	var max = {}, min = {};

	var ctx = document.getElementById('canvas').getContext('2d');
	var period = document.getElementById('period');
	var value = document.getElementById('value');

	//config
	var speed = 40; //periods per second, left or right
	var field = 'immigrants';
	var dataFile = 'data/immigration.tsv';
	var colors = {
		bg: '#333333',
		line: 'rgb(63, 113, 190)',
		fill: 'rgba(63, 113, 190, 0.3)',
		grid: '#222222',
		text: '#ffffff',
		player: '#ff0000'
	};
	var dim = {
		chartLine: 1,
		scale: 1 * dpr, //canvas pixels per "world" unit
		player: 3,
		vPadding: 10,
		gridLine: 1,
		gridSpacing: 20, //distance between x axis grid lines
		x: 8, //distance per period on x axis
		y: 1 / 4000, //distance per $ on y axis
		z: 5 //default zoom level
	};

	function keyDown(evt) {
		switch (event.keyCode) {
			case 37: //left
			case 65: //a
				buttons.leftKey = true;
				break;
			case 39: //right
			case 68: //d
				buttons.rightKey = true;
				break;
		}
	}

	function keyUp(evt) {
		switch (event.keyCode) {
			case 37: //left
			case 65: //a
				buttons.leftKey = false;
				break;
			case 39: //right
			case 68: //d
				buttons.rightKey = false;
				break;
		}
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
	Given an x coord in world space, find the nearest data point

	Restricts search to a small section, based on the assumption
	that we're not missing more than a few periods of data. Remove
	this optimization if the data changes
	*/

	function findPoint(date) {
		// var est = data.length * (date - min.date) / max.date;
		// var lo = Math.max(0, Math.floor(est - 8));
		// var hi = Math.min(data.length - 1, Math.ceil(est + 8));
		var index = binarySearch(data, {
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
		return findPoint(date);
	}

	function draw() {
		//todo: declare all variables at top
		var width = ctx.canvas.width,
			height = ctx.canvas.height;

		//calculate "camera" values
		var scale = camera.position.z * dim.scale;
		var worldWidth = width * scale;
		var worldHeight = height * scale;
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

		//horizontal
		i = Math.ceil(pointToX(data[lo]) / dim.gridSpacing) * dim.gridSpacing;
		while (i < maxWorldX) {
			x = canvasX(i);
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			i += dim.gridSpacing;
		}

		i = Math.ceil(minWorldY / dim.gridSpacing) * dim.gridSpacing;
		while (i < maxWorldY) {
			y = canvasY(i);
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			i += dim.gridSpacing;
		}
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
			delta = Math.min(500, (Date.now() - lastTime) / 1000);

		function updatePlayer() {
			var i,
				point,
				next,
				lowX,
				highX,
				partial,
				x,
				y;

			x = player.position.x;

			//move left or right
			if (buttons.leftKey || buttons.left) {
				x -= speed * delta;
			}
			if (buttons.rightKey || buttons.right) {
				x += speed * delta;
			}

			//keep on screen
			x = Math.min(max.x, Math.max(min.x, x));

			i = nearestPoint(x);
			point = data[i];
			lowX = pointToX(point);
			y = pointToY(point);

			//interpolate
			if (x > lowX && i < data.length - 1) {
				next = data[i + 1];
				highX = pointToX(next);
				partial = (x - lowX) / (highX - lowX);
				y = (1 - partial) * y + partial * pointToY(next);
			}

			player.position.x = x;
			player.position.y = y;

			//display stats
			period.textContent = point.date;
			value.textContent = format(point[field], '0,0', { thousandsDelimeter: ',' });
		}

		updatePlayer();

		dolly.update(delta);

		//todo: don't draw if no updates
		draw();

		lastTime = now;

		requestAnimationFrame(animate);
	}

	function loadNotes() {
		xhr('data/notes.tsv', 'type:text/tab-separated-values', function(response) {
			var tsv = response.responseText.trim().split('\n');
			var fields = tsv.shift().split('\t');

			tsv.map(function (line, i) {
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
			}).forEach(function (note) {
				var lo = findPoint(note.start);
				var hi = Math.min(data.length, findPoint(note.end) + 1);
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
				/*
				Set up the prop as an attractor. playerProp is the prop that triggers
				the transition by approaching the subject, and castleScene is the subject
				to be approached. camProp is the prop that's moved by the attractor, and
				offset is the position relative to the castle where we want to move the
				camera
				*/
				var attractor = dolly.prop({
					name: note.date,
					position: [(minX + maxX) / 2, 0, 0]
				});

				camera.attract(timeline, attractor, {
					offset: [0, (minY + maxY) / 2, note.zoom],
					innerRadius: (maxX - minX) / 2,
					outerRadius: 1.2 * (maxX - minX) / 2
				});
			});

			timeline.on('enterattractor', function (prop, att) {
				console.log('approaching', prop.name, att, prop);
				console.log('player at ', player.position.toString());
				console.log('timeline at ', timeline.position.toString());
				console.log(data[nearestPoint(player.position.x)]);
			});

		});
	}

	ctx.canvas.width *= dpr;
	ctx.canvas.height *= dpr;

	xhr(dataFile, 'type:text/tab-separated-values', function(response) {
		var tsv = response.responseText.split('\n');
		var fields = tsv.shift().split('\t');

		fields.forEach(function (field) {
			min[field] = Infinity;
			max[field] = -Infinity;
		});

		data = tsv.map(function (line, i) {
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

		/*
		set min/max of camera based on zoom
		todo: re-calculate this if canvas is resized
		*/
		var marginX = ctx.canvas.width / (dim.z * dim.scale) / 2;
		var marginY = ctx.canvas.height / (dim.z * dim.scale) / 2;
		camera.minBounds.x = marginX;
		camera.minBounds.y = marginY;
		camera.maxBounds.x = max.x - marginX;
		camera.maxBounds.y = (max[field] - min[field]) * dim.y - marginY + dim.vPadding * 2;

		loadNotes();

		animate();

		document.addEventListener('keydown', keyDown, false);
		document.addEventListener('keyup', keyUp, false);
	});
}());