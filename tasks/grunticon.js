/*
 * grunticon
 * https://github.com/filamentgroup/grunticon
 *
 * Copyright (c) 2012 Scott Jehl, Filament Group, Inc
 * Licensed under the MIT license.
 */

var path = require('path');
var noface = require('noface');

var previewTmpl = path.join( __dirname, "grunticon/static/preview.html" );
var asyncCSS = path.join( __dirname, "grunticon/static/grunticon.loader.js" );
var asyncCSSBanner = path.join( __dirname, "grunticon/static/grunticon.loader.banner.js" );

module.exports = function(grunt) {

	grunt.registerMultiTask( 'grunticon', 'A mystical CSS icon solution.', function() {
		// get the config
		var config = typeof( this.data ) === 'object' ? this.data : {};
		var src = this.file.src;
		var dest = this.file.dest;

		// CSS filenames with optional mixin from config
		var datasvgcss = config.datasvgcss || "icons.data.svg.css";
		var datapngcss = config.datapngcss || "icons.data.png.css";
		var urlpngcss = config.urlpngcss || "icons.fallback.css";

		//filename for generated output preview HTML file
		var previewhtml = config.previewhtml || "preview.html";

		// filename for generated loader HTML snippet file
		var loadersnippit = config.loadersnippet || "grunticon.loader.txt";

		// css references base path for the loader
		var cssbasepath = config.cssbasepath || "/";

		// folder name (within the output folder) for generated png files
		var pngfolder = config.pngfolder || "png/";

		// css class prefix
		var cssprefix = config.cssprefix || "icon-";

		// collect svgs
		var svgs = {};
		grunt.file.recurse( src, function(filePath){
			if( /\.svg$/.test( filePath ) ){
				var name = path.basename( filePath, '.svg' );
				svgs[name] = grunt.file.read( filePath );
			}
		});

		// render svgs to pngs
		var done = this.async();
		grunt.helper( 'render_svgs', svgs, function(err, pngs){
			if( err ){
				grunt.log.error( err.message );
				grunt.fail.warn( "Failed to render SVGs. ");
				return done();
			}

			// write fallback pngs
			grunt.util._.each( pngs, function(obj, key){
				var buf = new Buffer( obj.base64, "base64" );
				grunt.file.write( path.join( dest, pngfolder, key + '.png' ), buf );
			});
			grunt.log.writeln( "Rendered " + grunt.util._.size( svgs ) + " SVGs." );

			// write stylesheets
			grunt.helper( 'iconsheet_svg_data', cssprefix, svgs, path.join( dest, datasvgcss ) );
			grunt.helper( 'iconsheet_png_data', cssprefix, pngs, path.join( dest, datapngcss ) );
			grunt.helper( 'iconsheet_png_url', cssprefix, pngs, pngfolder, path.join( dest, urlpngcss ) );
			grunt.log.writeln( "Generated icon stylesheets." );

			// write loader file
			var src = "<!-- Unicode CSS Loader: place this in the head of your page -->\n";
			src += grunt.helper( 'icons_loader', cssbasepath, datasvgcss, datapngcss, urlpngcss, true );
			grunt.file.write( path.join( dest, loadersnippit ), src );
			grunt.log.writeln( "Generated loader snippit." );

			// write the preview file
			grunt.helper( 'icons_preview', cssprefix, pngs, datasvgcss, datapngcss, urlpngcss, path.join( dest, previewhtml ) );
			grunt.log.writeln( "Generated HTML preview." );

			done();
		});

	});

	// Render a bunch of SVGs to PNGs. Takes a object containing SVG data as
	// values, and returns a similar map with render output as values.
	grunt.registerHelper( 'render_svgs', function(map, callback) {

		// spin up phantomjs to render pngs for us
		var ph = noface( function(channel){
			channel.onmessage = function(event){
				var svgdata = event.data;

				var page = require( "webpage" ).create();

				// get svg element's dimensions so we can set the viewport dims later
				var frag = window.document.createElement( "div" );
				frag.innerHTML = svgdata;
				var svgelem = frag.querySelector( "svg" );
				var width = svgelem.getAttribute( "width" );
				var height = svgelem.getAttribute( "height" );

				// set page viewport size to svg dimensions
				page.viewportSize = {
					width: parseFloat(width),
					height: parseFloat(height)
				};

				// open svg file in webkit to make a png
				var svgdatauri = "data:image/svg+xml;base64," + btoa(svgdata);
				page.open( svgdatauri, function(status){
					if( status !== "success" ){
						channel.send( "fail" );
					}
					else {
						// create png file
						var base64 = page.renderBase64( "PNG" );
						channel.send( JSON.stringify({
							base64: base64,
							width: width,
							height: height
						}) );
					}
				} );
			};
		});

		ph.on( "error", function(err){
			callback( err );
		});

		// once up, process svgs one by one
		ph.on( "open", function(){
			var out = {};
			var keys = Object.keys( map );
			grunt.util.async.forEachSeries( keys, function(key, callback){
				grunt.verbose.write( "Rendering " + key + "..." );
				ph.send( map[key] );
				ph.once( "message", function(result){
					if( result === "fail" ) {
						grunt.verbose.error();
						var err = new Error( "Could not render SVG '" + key );
						callback( err );
					}
					else {
						grunt.verbose.ok();
						out[key] = JSON.parse( result );
						callback( null );
					}
				});
			}, function(err) {
				ph.close();

				if( err )
					callback( err );
				else
					callback( null, out );
			});
		});

	});

	// Write a stylesheet containing SVG data URIs.
	grunt.registerHelper( 'iconsheet_svg_data', function(cssprefix, svgs, dest) {
		var rules = grunt.utils._.map( svgs, function( raw, name ){
			var buf = new Buffer( raw, "utf-8" );
			var uri = "data:image/svg+xml;base64," + buf.toString( "base64" );
			return "." + cssprefix + name + " { background-image: url(" + uri + "); background-repeat: no-repeat; }";
		});
		grunt.file.write( dest, rules.join( "\n\n" ) );
	});

	// Write a stylesheet containing PNG data URIs.
	grunt.registerHelper( 'iconsheet_png_data', function(cssprefix, pngs, dest) {
		var rules = grunt.utils._.map( pngs, function( obj, name ){
			var uri = "data:image/png;base64," + obj.base64;
			return "." + cssprefix + name + " { background-image: url(" + uri + "); background-repeat: no-repeat; }";
		});
		grunt.file.write( dest, rules.join( "\n\n" ) );
	});

	// Write a stylesheet containing PNG fallback URLs.
	grunt.registerHelper( 'iconsheet_png_url', function(cssprefix, pngs, pngfolder, dest) {
		var rules = grunt.utils._.map( pngs, function( obj, name ){
			return "." + cssprefix + name + " { background-image: url(" + pngfolder + name + ".png); background-repeat: no-repeat; }";
		});
		grunt.file.write( dest, rules.join( "\n\n" ) );
	});

	// Generate the loader
	grunt.registerHelper( 'icons_loader', function(base, datasvgcss, datapngcss, urlpngcss, minify){
		// generate the javascript
		var asyncsrc = grunt.file.read( asyncCSS );
		asyncsrc += "\ngrunticon(" + JSON.stringify( [
			path.join( base + datasvgcss ),
			path.join( base + datapngcss ),
			path.join( base + urlpngcss )
		] ) + ");";

		// generate html
		src  = "<script>\n";
		src += grunt.file.read( asyncCSSBanner ) + "\n";
		src += minify ? grunt.helper( 'uglify', asyncsrc ) : asyncsrc;
		src += "</script>\n";
		src += '<noscript><link href="' + path.join( base, urlpngcss ) + '" rel="stylesheet"></noscript>';

		return src;
	});

	// Write the preview html file.
	grunt.registerHelper( 'icons_preview', function(cssprefix, pngs, datasvgcss, datapngcss, urlpngcss, dest) {
		// get the loader code
		var loader = grunt.helper( 'icons_loader', '', datasvgcss, datapngcss, urlpngcss, false );

		// generate the body
		var body = grunt.utils._.map( pngs, function( obj, name ){
			return '<pre><code>.' + cssprefix + name + ':</code></pre><div class="' + cssprefix + name + '" style="width: '+ obj.width +'; height: '+ obj.height +'"></div><hr/>';
		});

		// build the preview from the template
		var html = grunt.file.read( previewTmpl )
			.replace( "<!-- LOADER -->", loader )
			.replace( "<!-- BODY -->", body.join( "\n\t" ) );

		// write the file
		grunt.file.write( dest, html );
	});

};
