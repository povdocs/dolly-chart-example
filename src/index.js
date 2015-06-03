(function () {
	'use strict';

	//dependencies
	var Dolly = require('dolly');
	var xhr = require('d3-xhr');
	var binarySearch = require('binary-search');

	var WEEK = 1000 * 60 * 60 * 24 * 7;

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
	var buttons = {
		left: false,
		right: false,
		leftKey: false,
		rightKey: false
	};

	var max = {}, min = {};
	var currentIndex = 0;

	var ctx = document.getElementById('canvas').getContext('2d');

	//config
	var speed = 30; //weeks per second, left or right
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
		x: 3, //distance per week on x axis
		y: 1 / 10, //distance per $ on y axis
		z: 4 //default zoom level
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
	Converts from date/close value to x/y in "world" space
	*/
	function pointToX(point) {
		//convert date to week # before scaling
		var week = (point.date - min.date) / WEEK;
		return week * dim.x;
	}

	function pointToY(point) {
		return (point.close - min.close) * dim.y + dim.vPadding;
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
	that we're not missing more than a few weeks of data. Remove
	this optimization if the data changes
	*/
	function nearestPoint(x) {
		var date = Math.floor(x / dim.x * WEEK) + min.date;
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

		function y(x) {
			/*
			todo: move all this logic into an imperative function
			so we can re-use all these calculations to pick the current
			data point and display the date and other stats.
			*/
			var i = nearestPoint(x),
				lowX = pointToX(data[i]),
				highX,
				partial,
				next,
				result;

			result = pointToY(data[i]);

			//interpolate
			if (x > lowX && i < data.length - 1) {
				next = data[i + 1];
				highX = pointToX(next);
				partial = (x - lowX) / (highX - lowX);
				result = (1 - partial) * result + partial * pointToY(next);
			}

			return result;
		}

		//move left or right
		if (buttons.leftKey || buttons.left) {
			player.position.x -= speed * delta;
		}
		if (buttons.rightKey || buttons.right) {
			player.position.x += speed * delta;
		}
		player.position.x = Math.min(max.x, Math.max(min.x, player.position.x));
		player.position.y = y(player.position.x);
		currentIndex = nearestPoint(player.position.x);

		dolly.update(delta);

		//todo: don't draw if no updates
		draw();

		lastTime = now;

		requestAnimationFrame(animate);
	}

	xhr('data/nasdaq.tsv', 'type:text/tab-separated-values', function(response) {
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
					var val;
					if (i === 0) {
						val = Date.parse(str);
					} else {
						val = parseFloat(str);
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

		camera.follow(player, {
			offset: [0, 0, dim.z],
			radius: 6
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
		camera.maxBounds.y = (max.close - min.close) * dim.y - marginY + dim.vPadding * 2;

		animate();

		document.addEventListener('keydown', keyDown, false);
		document.addEventListener('keyup', keyUp, false);
	});
}());