/**
 * Grunt multicon task.
 *
 * @copyright (c) 2012, Two Screen
 * @license The MIT License
 * @author Stephan Kochen <stephan@two-screen.tv>
 * @author Mattijs Hoitink <mattijs@monkeyandmachine.com>
 */
"use strict";

var path = require('path');
var noface = require('noface');

/**
 *
 */
module.exports = function(grunt) {

    /**
     * Grunt multicon task definition.
     *
     *
     * @example
     *  multicon: {
     *      build: {
     *          options: {
     *              src:            "example/source/",
     *              dest:           "example/output/",
     *              datasvgcss:     "icons.data.svg.css",
     *              datapngcss:     "icons.data.png.css",
     *              urlpngcss:      "icons.fallback.css",
     *              previewhtml:    "preview.html",
     *              loadersnippet:  "grunticon.loader.txt",
     *              pngfolder:      "png/",
     *              cssprefix:      "icon-wee-",
     *              cssbasepath:    "/"
     *          }
     *      }
     *  },
     */
    grunt.registerMultiTask('multicon', 'A mystical CSS icon solution.', function() {
        // Get the config
        var config = this.options();
        var src = config.src;
        var dest = config.dest;

        // base directory to strip off names
        var basedir = config.basedir || '';
        if (!/\/$/.test(basedir))
            basedir += '/';

        // scaled variants
        var variants = config.variants || [1];

        // CSS filenames with optional mixin from config
        var datasvgcss = config.datasvgcss || "icons.data.svg";
        var datapngcss = config.datapngcss || "icons.data.png";
        var urlpngcss = config.urlpngcss || "icons.fallback";

        // folder name (within the output folder) for generated png files
        var pngfolder = config.pngfolder || "png/";

        // css class prefix
        var cssprefix = config.cssprefix || "icon-";

        // collect svgs
        var images = [];
        grunt.file.expand(src).forEach(function(filePath) {
            if (/\.svg$/.test(filePath)) {
                // strip of extension and base
                var rel = filePath.slice(0, -4);
                if (rel.slice(0, basedir.length) === basedir)
                    rel = rel.slice(basedir.length);

                // determine the icon class name
                var className = cssprefix + rel.replace(/\//g, '-');

                // push each variant onto the stack to process
                variants.forEach(function(scale) {
                    // determine the stylesheet relative path
                    var name = rel + scaleSuffix(scale) + '.png';
                    var relPath = path.join(pngfolder, name);

                    // determine output path
                    var destPath = path.join(dest, relPath);

                    // create the object
                    images.push({
                        className: className,
                        filePath: filePath,
                        destPath: destPath,
                        relPath: relPath,
                        scale: scale,
                        svg: grunt.file.read(filePath)
                    });
                });
            }
        });

        // render svgs to pngs
        var done = this.async();
        render_svgs(images, function(err) {
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

            variants.forEach(function(scale) {
                var name;

                // Select all images for this variant.
                var variantImages = images.filter(function(image) {
                    return image.scale === scale;
                });

                // write svg data uri stylesheet
                name = datasvgcss + scaleSuffix(scale) + '.css';
                iconsheet_svg_data(variantImages, path.join(dest, name));

                // write png data uri stylesheet
                name = datapngcss + scaleSuffix(scale) + '.css';
                iconsheet_png_data(variantImages, path.join(dest, name));

                // write png fallback url stylesheet
                name = urlpngcss + scaleSuffix(scale) + '.css';
                iconsheet_png_url(variantImages, path.join(dest, name));
            });

            grunt.log.writeln("Generated icon stylesheets.");

            done();
        });

    });

    // Render a bunch onf SVGs to PNGs.
    //
    // Takes an array of objects, each with a `svg` attribute containing
    // string SVG data and a `filePath`. The attributes `pngBase64`, `width`
    // and `height` will be set on each of the objects on success.
    function render_svgs(images, callback) {
        /*global window:true*/

        // spin up phantomjs to render pngs for us
        var ph = noface(function(channel) {
            channel.onmessage = function(event) {
                var image = JSON.parse(event.data);

                var page = require("webpage").create();

                // get svg element's dimensions so we can set the viewport dims later
                var frag = window.document.createElement("div");
                frag.innerHTML = image.svg;
                var svgelem = frag.querySelector("svg");
                var width = parseFloat(svgelem.getAttribute("width")) * image.scale;
                var height = parseFloat(svgelem.getAttribute("height")) * image.scale;

                // set page viewport size to svg dimensions
                page.viewportSize = { width: width, height: height };
                page.zoomFactor = image.scale;

                // open svg file in webkit to make a png
                var svgdatauri = "data:image/svg+xml;base64," + window.btoa(image.svg);
                page.open(svgdatauri, function(status) {
                    if (status !== "success") {
                        channel.send("fail");
                    }
                    else {
                        // create png file
                        var pngBase64 = page.renderBase64("PNG");
                        channel.send(JSON.stringify({
                            pngBase64: pngBase64,
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
                ph.send(JSON.stringify(image));
                ph.once("message", function(result) {
                    if (result === "fail") {
                        grunt.verbose.error();

                        callback(Error("Could not render " + image.filePath));
                    }
                    else {
                        grunt.verbose.ok();

                        var obj = JSON.parse(result);
                        image.pngBase64 = obj.pngBase64;
                        image.width = obj.width;
                        image.height = obj.height;

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

    }

    // Write a stylesheet containing SVG data URIs.
   function iconsheet_svg_data(images, dest) {
        var rules = grunt.util._.map(images, function(image) {
            var buf = new Buffer(image.svg, "utf-8");
            var uri = "data:image/svg+xml;base64," + buf.toString("base64");
            var sizerule;
            if (image.scale !== 1) {
                sizerule = "background-size: ";
                if (image.width === image.height)
                    sizerule += image.width + "px; ";
                else
                    sizerule += image.width + "px " + image.height + "px; ";
            }
            else {
                sizerule = "";
            }
            return "." + image.className + " { " +
                    "background-image: url(" + uri + "); " +
                    "background-repeat: no-repeat; " +
                    sizerule +
                "}";
        });
        grunt.file.write(dest, rules.join("\n\n"));
    }

    // Write a stylesheet containing PNG data URIs.
    function iconsheet_png_data(images, dest) {
        var rules = grunt.util._.map(images, function(image) {
            var uri = "data:image/png;base64," + image.pngBase64;
            return "." + image.className + " { " +
                    "background-image: url(" + uri + "); " +
                    "background-repeat: no-repeat; " +
                "}";
        });
        grunt.file.write(dest, rules.join("\n\n"));
    }

    // Write a stylesheet containing PNG fallback URLs.
    function iconsheet_png_url(images, dest) {
        var rules = grunt.util._.map(images, function(image) {
            return "." + image.className + " { " +
                    "background-image: url(" + image.relPath + "); " +
                    "background-repeat: no-repeat; " +
                "}";
        });
        grunt.file.write(dest, rules.join("\n\n"));
    }

    // generate scale filename suffix for a variant
    function scaleSuffix(scale) {
        return scale === 1 ? '' : '.x' + String(scale);
    }

};
