/*
 * grunticon
 * https://github.com/filamentgroup/grunticon
 *
 * Copyright (c) 2012 Scott Jehl, Filament Group, Inc
 * Licensed under the MIT license.
 */

var path = require('path');
var noface = require('noface');

module.exports = function(grunt) {

    grunt.registerMultiTask('grunticon', 'A mystical CSS icon solution.', function() {
        // get the config
        var config = typeof(this.data) === 'object' ? this.data : {};
        var src = this.file.src;
        var dest = this.file.dest;

        // base directory to strip off names
        var basedir = config.basedir || '';
        if (!/\/$/.test(basedir))
            basedir += '/';

        // CSS filenames with optional mixin from config
        var datasvgcss = config.datasvgcss || "icons.data.svg.css";
        var datapngcss = config.datapngcss || "icons.data.png.css";
        var urlpngcss = config.urlpngcss || "icons.fallback.css";

        // folder name (within the output folder) for generated png files
        var pngfolder = config.pngfolder || "png/";

        // css class prefix
        var cssprefix = config.cssprefix || "icon-";

        // collect svgs
        var images = [];
        grunt.file.expandFiles(src).forEach(function(filePath) {
            if (/\.svg$/.test(filePath)) {
                // strip of extension and base
                var rel = filePath.slice(0, -4);
                if (rel.slice(0, basedir.length) === basedir)
                    rel = rel.slice(basedir.length);

                // determine the icon class name
                var className = cssprefix + rel.replace(/\//g, '-');

                // determine the stylesheet relative path
                var relPath = path.join(pngfolder, rel + '.png');

                // determine output path
                var destPath = path.join(dest, relPath);

                // push onto the stack to process
                images.push({
                    className: className,
                    filePath: filePath,
                    destPath: destPath,
                    relPath: relPath,
                    svg: grunt.file.read(filePath)
                });
            }
        });

        // render svgs to pngs
        var done = this.async();
        grunt.helper('render_svgs', images, function(err) {
            if (err) {
                grunt.log.error(err.message);
                grunt.fail.warn("Failed to render SVGs. ");
                return done();
            }

            // write fallback pngs
            grunt.util._.each(images, function(image) {
                var buf = new Buffer(image.pngBase64, "base64");
                grunt.file.write(image.destPath, buf);
            });
            grunt.log.writeln("Rendered " + images.length + " SVGs.");

            // write stylesheets
            grunt.helper('iconsheet_svg_data', images, path.join(dest, datasvgcss));
            grunt.helper('iconsheet_png_data', images, path.join(dest, datapngcss));
            grunt.helper('iconsheet_png_url', images, path.join(dest, urlpngcss));
            grunt.log.writeln("Generated icon stylesheets.");

            done();
        });

    });

    // Render a bunch of SVGs to PNGs.
    //
    // Takes an array of objects, each with a `svg` attribute containing
    // string SVG data and a `filePath`. The attributes `pngBase64`, `width`
    // and `height` will be set on each of the objects on success.
    grunt.registerHelper('render_svgs', function(images, callback) {

        // spin up phantomjs to render pngs for us
        var ph = noface(function(channel) {
            channel.onmessage = function(event) {
                var svgdata = event.data;

                var page = require("webpage").create();

                // get svg element's dimensions so we can set the viewport dims later
                var frag = window.document.createElement("div");
                frag.innerHTML = svgdata;
                var svgelem = frag.querySelector("svg");
                var width = svgelem.getAttribute("width");
                var height = svgelem.getAttribute("height");

                // set page viewport size to svg dimensions
                page.viewportSize = {
                    width: parseFloat(width),
                    height: parseFloat(height)
                };

                // open svg file in webkit to make a png
                var svgdatauri = "data:image/svg+xml;base64," + btoa(svgdata);
                page.open(svgdatauri, function(status) {
                    if (status !== "success") {
                        channel.send("fail");
                    }
                    else {
                        // create png file
                        var base64 = page.renderBase64("PNG");
                        channel.send(JSON.stringify({
                            base64: base64,
                            width: width,
                            height: height
                        }));
                    }
                });
            };
        });

        ph.on("error", function(err) {
            callback(err);
        });

        // once up, process svgs one by one
        ph.on("open", function() {
            grunt.util.async.forEachSeries(images, function(image, callback) {
                grunt.verbose.write("Rendering " + image.filePath + "...");
                ph.send(image.svg);
                ph.once("message", function(result) {
                    if (result === "fail") {
                        grunt.verbose.error();

                        callback(Error("Could not render " + image.filePath));
                    }
                    else {
                        grunt.verbose.ok();

                        var result = JSON.parse(result);
                        image.pngBase64 = result.base64;
                        image.width = result.width;
                        image.height = result.height;

                        callback(null);
                    }
                });
            }, function(err) {
                ph.close();

                if (err)
                    callback(err);
                else
                    callback(null);
            });
        });

    });

    // Write a stylesheet containing SVG data URIs.
    grunt.registerHelper('iconsheet_svg_data', function(images, dest) {
        var rules = grunt.utils._.map(images, function(image) {
            var buf = new Buffer(image.svg, "utf-8");
            var uri = "data:image/svg+xml;base64," + buf.toString("base64");
            return "." + image.className + " { background-image: url(" + uri + "); background-repeat: no-repeat; }";
        });
        grunt.file.write(dest, rules.join("\n\n"));
    });

    // Write a stylesheet containing PNG data URIs.
    grunt.registerHelper('iconsheet_png_data', function(images, dest) {
        var rules = grunt.utils._.map(images, function(image) {
            var uri = "data:image/png;base64," + image.pngBase64;
            return "." + image.className + " { background-image: url(" + uri + "); background-repeat: no-repeat; }";
        });
        grunt.file.write(dest, rules.join("\n\n"));
    });

    // Write a stylesheet containing PNG fallback URLs.
    grunt.registerHelper('iconsheet_png_url', function(images, dest) {
        var rules = grunt.utils._.map(images, function(image) {
            return "." + image.className + " { background-image: url(" + image.relPath + "); background-repeat: no-repeat; }";
        });
        grunt.file.write(dest, rules.join("\n\n"));
    });

};
