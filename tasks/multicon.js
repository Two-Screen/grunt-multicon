/**
 * Grunt multicon task.
 *
 * @copyright (c) 2013, Stephan Kochen, Mattijs Hoitink Two Screen
 * @license The MIT License
 * @author Stephan Kochen <stephan@two-screen.tv>
 * @author Mattijs Hoitink <mattijs@monkeyandmachine.com>
 */
"use strict";

var fs     = require('fs');
var path   = require('path');
var noface = require('noface');
var slug   = require('slugg');

// Export for Grunt.
module.exports = function(grunt) {

    /**
     * Grunt multicon task definition.
     *
     *
     * @example
     *  multicon: {
     *      build: {
     *          options: {
     *              css: {
     *                  prefix:   "icon-",
     *                  baseurl:  "/"
     *              },
     *              sheets: {
     *                  svg:      "icons.data.svg.css",
     *                  png:      "icons.data.png.css",
     *                  fallback: "icons.fallback.css"
     *              },
     *              preview:      "preview.html",
     *              basepath:     ".",
     *              folder:       "png",
     *              scales:       [ 1 ]
     *          },
     *          src:  [ "example/source/\*.svg" ],
     *          dest: "example/output",
     *      }
     *  },
     */
    grunt.registerMultiTask('multicon', 'Create stylesheets from SVG icons.', function() {
        var _ = grunt.util._;
        var async = grunt.util.async;

        // This is an async task
        var done = this.async();

        // Get the config
        var config = this.options({
            css: {
                prefix: 'icon-',
                baseurl: '/'
            },
            sheets: {
                svg:      "icons.data.svg.css",
                png:      "icons.data.png.css",
                fallback: "icons.fallback.css"
            },
            basepath: '',
            preview:  'preview.html',
            folder:   'png',
            scales:   [ 1 ]
        });

        // Get the source and destination files from the files property
        // There should only be one definition, so we take the first one
        config.paths = this.files.shift();

        // The base path will be stripped off source file paths before writing
        // the icons to the destination. Make sure it ends with a '/'.
        if (!/\/$/.test(config.basepath)) config.basepath += '/';

        // Wrap a function and add the config as the first parameter when
        // calling the wrapped function
        function configure(fn) {
            return function(images, callback) {
                return fn(config, images, callback);
            };
        }

        // Start doing things, it alls down the drain from here
        async.waterfall([
            function(next) {
                configure(collectSVGFiles)(null, next);
            },
            renderPNGImages,
            configure(writePNGImages),
            configure(writeCSSFiles),
            //configure(writeHTMLPreview)
        ], function(error, result) {
            if (error) {
                grunt.fail.fatal(error);
            }
            else {
                // We are all done
                grunt.log.writeln('Wrote icons and stylesheets to ' + config.paths.dest.cyan);
            }
        });
    });

    /**
     * Collect icon files that have to be processed. A data object is created
     * for each image containing paths and the icon data.
     *
     * The config object contains configuration parameters for finding icons
     * and how to process them. It should at least contain a `paths` object
     * with a `src` and `dest` key for reading and writing the icon files.
     *
     * @param {Object} config
     * @param {Function} callback
     */
    function collectSVGFiles(config, images, callback) {
        // Collect SVG files from the source location(s)
        var files = config.paths.src.filter(isSvgFile);

        // Reset images list (assume it is empty)
        images = [];

        // Process the SVG files and construct required configuration per
        // image version
        files.forEach(function(filePath) {
            // Strip of extension and base path
            var name = filePath.slice(0, path.extname(filePath).length * -1);
            name = path.relative(config.basepath, name);

            // Determine the icon class name
            var classname = config.css.prefix + slug(path.basename(name));

            // Push each scaled version onto the stack to process
            config.scales.forEach(function(scale) {
                // Determine the icons filename and destination output path
                var filename = name + scaleSuffix(scale) + '.png';
                var destPath = path.join(config.paths.dest, config.folder, filename);
                var relPath  = path.relative(config.paths.dest, destPath);

                // Determine the image's URL
                var url = relPath.replace('\\', '/');
                var baseurl = config.css.baseurl;
                if (baseurl && typeof(baseurl) === 'string' && baseurl.length > 0) {
                    url = baseurl + '/' + url;
                }

                // Build the data Object for processing the image version
                images.push({
                    scale:     scale,
                    filename:  filename,
                    classname: classname,
                    destPath:  destPath,
                    relPath:   relPath,
                    url:       url,
                    svg:      {
                        data: grunt.file.read(filePath)
                    }
                });
            });
        });

        callback(null, images);
    }

    function writePNGImages(config, images, callback) {
        grunt.util._.each(images, function(image) {
            grunt.file.write(image.destPath, image.png.data);
        });

        callback(null, images);
    }

    function writeCSSFiles(config, images, callback) {
        var _ = grunt.util._;

        // Build CSS rules for the three CSS stylesheets out of the images
        var sheets = {};

        images.forEach(function(image) {
            var scale = image.scale;

            // Check if a sheet is defined for the image scale
            _.each(config.sheets, function(name, type) {
                var filename = sheetName(name, scale);
                if (!sheets[filename]) {
                    sheets[filename] = [];
                }
            });

            // Build SVG data rule for the image
            sheets[sheetName(config.sheets.svg, scale)].push(svgDataRule(image));

            // Build PNG data rule for the image
            sheets[sheetName(config.sheets.png, scale)].push(pngDataRule(image));

            // Build fallback rule for the image
            sheets[sheetName(config.sheets.fallback, scale)].push(fallbackCSSRule(image));
        });

        // Write all sheet versions to disk
        _.each(sheets, function(rules, filename) {
            grunt.file.write(path.join(config.paths.dest, filename), rules.join('\n\n'));
        });

        // All done
        callback(null, images);
    }

    // Render a bunch onf SVGs to PNGs.
    //
    // Takes an array of objects, each with a `svg` attribute containing
    // string SVG data and a `filePath`. The attributes `pngBase64`, `width`
    // and `height` will be set on each of the objects on success.
    function renderPNGImages(images, callback) {
        /*global window:true*/

        // spin up phantomjs to render pngs for us
        var ph = noface(function(channel) {
            channel.onmessage = function(event) {
                var image = JSON.parse(event.data);
                var page  = require("webpage").create();

                // Get svg element's dimensions so we can set the viewport
                // dimensions
                var frag = window.document.createElement("div");
                frag.innerHTML = image.svg.data;
                var svgelem = frag.querySelector("svg");
                var width = parseFloat(svgelem.getAttribute("width")) * image.scale;
                var height = parseFloat(svgelem.getAttribute("height")) * image.scale;

                // Set page viewport size to SVG dimensions
                page.viewportSize = { width: width, height: height };
                page.zoomFactor = image.scale;

                // Open SVG file in webkit to make a PNG
                var svgdatauri = "data:image/svg+xml;base64," + window.btoa(image.svg.data);
                page.open(svgdatauri, function(status) {
                    if (status !== "success") {
                        channel.send("fail");
                    }
                    else {
                        // Render the png image
                        var pngBase64 = page.renderBase64("PNG");
                        channel.send(JSON.stringify({
                            data:   pngBase64,
                            width:  width,
                            height: height
                        }));
                    }
                });
            };
        }, { stdio: [0,1,2] });

        // Error handler for PhantomJS
        ph.on("error", function(err) {
            callback(err);
        });

        // Wait fot PhantomJS to be ready
        ph.on("open", function() {

            // Render each SVG as a PNG image through PhantomJS
            grunt.util.async.forEachSeries(images, function(image, callback) {
                grunt.verbose.write("Rendering " + image.relPath + "...");

                // Send image data to PhantomJS
                ph.send(JSON.stringify(image));

                // Wait for a response, only once
                ph.once("message", function(result) {
                    if (result === "fail") {
                        grunt.verbose.error();
                        callback(Error("Could not render " + image.relPath));
                    }
                    else {
                        grunt.verbose.ok();

                        // Update the image with png data
                        var obj = JSON.parse(result);
                        image.png = obj;
                        image.png.data = new Buffer(image.png.data, 'base64');

                        // Done
                        callback(null);
                    }
                });
            }, function(err) {
                ph.close();

                if (err) {
                    callback(err);
                }
                else {
                    grunt.log.writeln("Rendered " + images.length + " SVGs.");
                    callback(null, images);
                }
            });
        });

    }


    function svgDataRule(image) {
        var buf = new Buffer(image.svg.data, "utf-8");
        var uri = "'data:image/svg+xml;base64," + buf.toString("base64") + "'";
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
        return "." + image.classname + " { " +
                "background-image: url('" + uri + "'); " +
                "background-repeat: no-repeat; " +
                sizerule +
            "}";
    }

    // Write a stylesheet containing PNG data URIs.
    function pngDataRule(image) {
        var uri = "data:image/png;base64," + image.png.data.toString('base64');
        return "." + image.classname + " { " +
                "background-image: url('" + uri + "'); " +
                "background-repeat: no-repeat; " +
            "}";
    }

    // Write a stylesheet containing PNG fallback URLs.
    function fallbackCSSRule(image) {
        return "." + image.classname + " { " +
                "background-image: url('" + image.url + "'); " +
                "background-repeat: no-repeat; " +
            "}";
    }

    // generate scale filename suffix for a variant
    function scaleSuffix(scale) {
        return scale === 1 ? '' : '.x' + String(scale);
    }

    /**
     * Generate a stylesheet name with an optional scale number included.
     * @param {String} base
     * @param {String|Number} scale
     * @return {String}
     */
    function sheetName(base, scale) {
        if (/\.css$/.test(base)) {
            base = base.substring(0, base.length - 4);
        }

        return base + scaleSuffix(scale) + '.css';
    }

    /**
     * Check if a file path is an SVG image file. The file contents are not
     * inspected, only it's existence and extension'
     *
     * @param {String} filePath
     * @return {Boolean}
     */
    function isSvgFile(filePath) {
        if (!filePath) return false;
        filePath = path.resolve(filePath);
        return fs.existsSync(filePath)
            && fs.lstatSync(filePath)
            && /\.svg$/.test(filePath);
    }
};
