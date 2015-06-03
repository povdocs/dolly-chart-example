module.exports = (function () {
	'use strict';

	var assign = require('object-assign');
	var webpack = require('webpack');
	var pkg = require('../package.json');

	var banner = [
		pkg.name + ' - ' + pkg.description,
		'@version v' + pkg.version,
		'@link ' + pkg.homepage,
		'@license ' + pkg.license
	].join('\n');

	var common = {
		// entry: './src/entry.js',
		module: {
			preLoaders: [
				{
					test: /\.js$/,
					exclude: /node_modules|bower_components|src\/lib/,
					loader: 'jshint-loader'
				}
			],
			loaders: [
				{
					test: /\.js$/,
					exclude: /node_modules/,
					loader: 'babel-loader'
				}
			]
		},

		//pretty strict
		jshint: {
			globals: {
				console: true
			},

			esnext: true,
			bitwise: true,
			browser: true,
			camelcase: true,
			curly: true,
			eqeqeq: true,
			es3: true,
			forin: true,
			freeze: true,
			funcscope: true,
			globalstrict: true,
			immed: true,
			iterator: true,
			latedef: true,
			maxparams: 4,
			newcap: true,
			noarg: true,
			nonbsp: true,
			nonew: true,
			notypeof: true,
			quotmark: 'single',
			shadow: true,
			//singleGroups: true,
			undef: true,
			//unused: true, todo: add this back in when more stuff is working

			failOnHint: true,
			emitErrors: true
		}
	};

	var exports = {};

	exports.dev = assign({}, common, {
		debug: true,
		devtool: 'eval', //sourcemap?
		output: {
			filename: 'index.js',
			pathInfo: true
		}
	});

	exports.production = assign({}, common, {
		devtool: 'source-map',
		output: {
			filename: 'index.js',
			sourceMapFilename: '[file].map'
		},
		plugins: [
			new webpack.optimize.DedupePlugin(),
			new webpack.optimize.UglifyJsPlugin({
				compress: {
					warnings: false
				},
			}),
			new webpack.BannerPlugin(banner)
		],
	});

	return exports;
}());