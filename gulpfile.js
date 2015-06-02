var gulp = require( "gulp" );
var gutil = require( "gulp-util" );
var sourcemaps = require( "gulp-sourcemaps" );
var rename = require( "gulp-rename" );
var header = require( "gulp-header" );
var imports = require( "gulp-imports" );
var pkg = require( "./package.json" );
var hintNot = require( "gulp-hint-not" );
var uglify = require( "gulp-uglify" );
var babel = require( "gulp-babel" );
var jscs = require( "gulp-jscs" );
var gulpChanged = require( "gulp-changed" );

var banner = [ "/**",
	" * <%= pkg.name %> - <%= pkg.description %>",
	" * Author: <%= pkg.author %>",
	" * Version: v<%= pkg.version %>",
	" * Url: <%= pkg.homepage %>",
	" * License(s): <% pkg.licenses.forEach(function( license, idx ){ %><%= license.type %> Copyright (c) <%= ( new Date() ).getFullYear() %> LeanKit<% if(idx !== pkg.licenses.length-1) { %>, <% } %><% }); %>",
	" */",
"" ].join( "\n" );

gulp.task( "build:es6", function() {
	return gulp.src( "src/lux-autohost.js" )
		.pipe( imports() )
		.pipe( hintNot() )
		.pipe( header( banner, {
			pkg: pkg
		} ) )
		.pipe( rename( "lux-autohost-es6.js" ) )
		.pipe( gulp.dest( "lib/" ) );
} );

function buildEs5() {
	return gulp.src( "src/lux-autohost.js" )
		.pipe( imports() )
		.pipe( hintNot() )
		.pipe( sourcemaps.init() )
		.pipe( babel( {
			auxiliaryComment: "istanbul ignore next",
			compact: false,
			blacklist: [ "strict" ],
			stage: 0
		} ) )
		.pipe( header( banner, {
			pkg: pkg
		} ) )
		.pipe( sourcemaps.write() )
		.pipe( rename( "lux-autohost.js" ) );
}

gulp.task( "build:es5:quick", function() {
	// build for testing, format to prevent source control showing changes
	return buildEs5()
		.pipe( jscs( {
			configPath: ".jscsrc",
			fix: true
		} ) )
		.pipe( gulp.dest( "lib/" ) );
} );

gulp.task( "build:es5", function() {
	return buildEs5()
		.pipe( gulp.dest( "lib/" ) )
		.pipe( uglify( {
			compress: {
				negate_iife: false
			}
		} ) )
		.pipe( header( banner, {
			pkg: pkg
		} ) )
		.pipe( rename( "lux-autohost.min.js" ) )
		.pipe( gulp.dest( "lib/" ) );
} );

gulp.task( "default", [ "format" ] );

var mocha = require( "gulp-spawn-mocha" );
gulp.task( "test", [ "build:es5:quick" ], function() {
	return gulp.src( [ "spec/**/*.spec.js" ], { read: false } )
		.pipe( mocha( {
			require: [ "spec/helpers/node-setup.js" ],
			reporter: "spec",
			colors: true,
			inlineDiffs: true,
			debug: false
		} ) )
		.on( "error", console.warn.bind( console ) );
} );

gulp.task( "watch", function() {
	gulp.watch( "src/**/*", [ "default" ] );
	gulp.watch( "{lib,spec}/**/*", [ "test" ] );
} );

gulp.task( "format", [ "build:es6", "build:es5" ], function() {
	return gulp.src( [ "**/*.js", "!node_modules/**" ] )
		.pipe( jscs( {
			configPath: ".jscsrc",
			fix: true
		} ) )
		.on( "error", function( error ) {
			gutil.log( gutil.colors.red( error.message ) );
			this.end();
		} )
		.pipe( gulpChanged( ".", { hasChanged: gulpChanged.compareSha1Digest } ) )
		.pipe( gulp.dest( "." ) );
} );
