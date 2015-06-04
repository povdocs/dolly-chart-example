(function () {
	'use strict';

	//dependencies
	var Dolly = require('dolly');
	var xhr = require('d3-xhr');
	var binarySearch = require('binary-search');
	var format = require('simple-number-formatter');

	var PERIOD = 1;//1000 * 60 * 60 * 24 * 7;

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
		scale: 1, //canvas pixels per "world" unit
		player: 3,
		vPadding: 10,
		gridLine: 0.1,
		xGrid: 10, //distance between x axis grid lines
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
	Convert from canvas space to world space
	*/
	function worldX(x) {
	}

	function worldY() {
		// body...
	}

	/*
	Given an x coord in world space, find the nearest data point

	Restricts search to a small section, based on the assumption
	that we're not missing more than a few periods of data. Remove
	this optimization if the data changes
	*/
	function nearestPoint(x) {
		var date = Math.floor(x / dim.x * PERIOD) + min.date;
		var est = data.length * (date - min.date) / max.date;
		var lo = Math.max(0, Math.floor(est - 8));
		var hi = Math.min(data.length - 1, Math.ceil(est + 8));
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

	function draw() {
		//todo: declare all variables at top
		var width = ctx.canvas.width,
			height = ctx.canvas.height;

		//debug
		// camera.position.set(width / 2 * dim.scale, height / 2 * dim.scale, 1);
		// camera.position.z = 4;

		//calculate "camera" values
		var scale = camera.position.z * dim.scale;
		var worldWidth = width * scale;
		var worldHeight = height * scale;
		var minWorldX = camera.position.x - worldWidth / 2;
		var maxWorldX = minWorldX + worldWidth;
		var minWorldY = camera.position.y - worldHeight / 2;

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

		//todo: draw x/y axes
		//todo: draw grid

		//draw line
		ctx.strokeStyle = colors.line;
		ctx.lineWidth = dim.chartLine;
		ctx.beginPath();
		var lo = nearestPoint(Math.max(0, minWorldX));
		var hi = nearestPoint(maxWorldX) + 1;
		var i;

		for (i = lo; i < hi; i++) {
			let point = data[i],
				x = canvasX(pointToX(point)),
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
		ctx.lineTo(width * dim.scale, height * dim.scale);
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

		animate();

		document.addEventListener('keydown', keyDown, false);
		document.addEventListener('keyup', keyUp, false);
	});
}());