/**
 * Grunt multicon task.
 *
 * @copyright (c) 2013, Stephan Kochen, Mattijs Hoitink, Two Screen
 * @license The MIT License
 * @author Mattijs Hoitink <mattijs@monkeyandmachine.com>
 * @author Stéphan Kochen <stephan@kochen.nl>
 * @see https://github.com/Two-Screen/grunt-multicon#readme
 */

var fs     = require('fs');
var path   = require('path');
var noface = require('noface');
var slug   = require('slugg');

// Export for Grunt.
module.exports = function(grunt) {
    "use strict";

    var _ = grunt.util._;
    var async = grunt.util.async;

    /**
     * Grunt multicon task definition.
     *
     * @example
     *  multicon: {
     *      build: {
     *          options: {
     *              css: {
     *                  prefix:   "icon-",
     *              },
     *              sheets: {
     *                  svg:      "icons.data.svg.css",
     *                  png:      "icons.data.png.css",
     *                  fallback: "icons.fallback.css"
     *              },
     *              basepath:     "",
     *              folder:       "png",
     *              scales:       [ 1 ]
     *          },
     *          src:  [ "example/source/\*.svg" ],
     *          dest: "example/output",
     *      }
     *  },
     */
    grunt.registerMultiTask('multicon', 'Create icon stylesheets from SVG images.', function() {
        // This is an async task
        var done = this.async();

        // Get the config
        var config = this.options({
            css: {
                prefix: 'icon-'
            },
            sheets: {
                svg:      "icons.data.svg.css",
                png:      "icons.data.png.css",
                fallback: "icons.fallback.css"
            },
            basepath: '',
            folder:   'png',
            scales:   [ 1 ]
        });

        // Update nested objects
        config.css = _.defaults(config.css || {}, {
            prefix: 'icon-'
        });
        config.sheets = _.defaults(config.sheets || {}, {
            svg:      "icons.data.svg.css",
            png:      "icons.data.png.css",
            fallback: "icons.fallback.css"
        });


        // Get the source and destination files from the files property.
        // There should only be one definition, so we take the first one.
        config.paths = this.files.shift();

        // The base path will be stripped off source file paths before writing
        // the icons to the destination. Make sure it ends with a '/'.
        if (!/\/$/.test(config.basepath))
            config.basepath += '/';

        // Wrap a function and add the config as the first parameter when
        // calling the wrapped function
        function configure(fn) {
            return function(images, callback) {
                return fn(config, images, callback);
            };
        }

        // Start doing things, it alls going down from here
        async.waterfall([
            function(next) {
                configure(collectSVGFiles)(null, next);
            },
            renderPNGImages,
            writePNGImages,
            configure(writeCSSFiles)
        ], done);
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
        files.forEach(function(src) {
            var basename = src.replace(new RegExp('^' + config.basepath), '');

            // Determine the icon class name
            var classname = config.css.prefix + path.basename(src, '.svg').replace('/', '-');

            // Push each scaled version onto the stack to process
            config.scales.forEach(function(scale) {
                // Determine the icons filename and destination output path
                var scaledName = scaledFilename(basename, scale).replace(/\.svg$/, '.png');
                var relPath    = path.join(config.folder, scaledName);
                var destPath   = path.join(config.paths.dest, relPath);

                // Build the data Object for processing the image version
                images.push({
                    scale:     scale,
                    filename:  scaledName,
                    classname: classname,
                    relPath:   relPath,
                    destPath:  destPath,
                    svg:      {
                        data: grunt.file.read(src)
                    }
                });
            });
        });

        callback(null, images);
    }

    /**
     * Write a list of images as PNG files to disk
     *
     * @param {Array} images        The list of images to write to disk. Each
     *                              images is represented as an Object containing
     *                              image data.
     * @param {Function} callback   Callback is called when writing is finished,
     *                              with two parameters: error and the list of images
     */
    function writePNGImages(images, callback) {
        grunt.util._.each(images, function(image) {
            grunt.file.write(image.destPath, image.png.data);
            grunt.log.writeln("File " + image.destPath + " created.");
        });

        callback(null, images);
    }

    /**
     * Write CSS files for the images to disk. Three CSS file per image scale
     * are generated.
     *
     * @param {Object} config       Config object
     * @param {Array} images        The list of images to write to disk. Each
     *                              images is represented as an Object containing
     *                              image data.
     * @param {Function} callback   Callback is called when writing is finished,
     *                              with two parameters: error and the list of images
     */
    function writeCSSFiles(config, images, callback) {
        var _ = grunt.util._;

        // Build CSS rules for the three CSS stylesheets out of the images
        var sheets = {};

        images.forEach(function(image) {
            var scale = image.scale;

            // Check if a sheet is defined for the image scale
            _.each(config.sheets, function(name, type) {
                var filename = scaledFilename(name, scale);
                if (!sheets[filename]) {
                    sheets[filename] = [];
                }
            });

            // Build SVG data rule for the image
            sheets[scaledFilename(config.sheets.svg, scale)].push(svgDataRule(image));

            // Build PNG data rule for the image
            sheets[scaledFilename(config.sheets.png, scale)].push(pngDataRule(image));

            // Build fallback rule for the image
            sheets[scaledFilename(config.sheets.fallback, scale)].push(fallbackCSSRule(image));
        });

        // Write all sheet versions to disk
        _.each(sheets, function(rules, filename) {
            var dest = path.join(config.paths.dest, filename);
            grunt.file.write(dest, rules.join('\n'));
            grunt.log.writeln("File " + dest + " created.");
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
                        callback(new Error("Could not render " + image.relPath));
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
                callback(err, images);
            });
        });

    }


    /**
     * Create an CSS data URI rule with SVG image data.
     *
     * @param {Object} Image    The image to create the rule for.
     * @return {String}         The generated CSS rule.
     */
    function svgDataRule(image) {
        var buf = new Buffer(image.svg.data, "utf-8");
        var uri = "'data:image/svg+xml;base64," + buf.toString("base64") + "'";
        var sizerule;
        if (image.scale !== 1) {
            sizerule = "background-size: ";
            if (image.png.width === image.png.height) {
                sizerule += image.png.width + "px; ";
            } else {
                sizerule += image.png.width + "px " + image.png.height + "px; ";
            }
        }
        else {
            sizerule = "";
        }
        return '.' + image.classname + ' { ' +
                'background-image: url(' + uri + '); ' +
                'background-repeat: no-repeat; ' +
                sizerule +
            '}';
    }

    /**
     * Create an CSS data URI rule with PNG image data.
     *
     * @param {Object} Image    The image to create the rule for.
     * @return {String}         The generated CSS rule.
     */
    function pngDataRule(image) {
        var uri = "data:image/png;base64," + image.png.data.toString('base64');
        return '.' + image.classname + ' { ' +
                'background-image: url(' + uri + '); ' +
                'background-repeat: no-repeat; ' +
            '}';
    }

    /**
     * Create an CSS background rule with an URL to an image.
     *
     * @param {Object} Image    The image to create the rule for.
     * @return {String}         The generated CSS rule.
     */
    function fallbackCSSRule(image) {
        return '.' + image.classname + ' { ' +
                'background-image: url("' + image.relPath + '"); ' +
                'background-repeat: no-repeat; ' +
            '}';
    }

    // generate scale filename suffix for a variant
    function scaleSuffix(scale) {
        return scale === 1 ? '' : '.x' + String(scale);
    }

    /**
     * Generate a stylesheet name with an optional scale number included.
     * @param {String} filename
     * @param {String|Number} scale
     * @return {String}
     */
    function scaledFilename(filename, scale) {
        if (!scale) {
            return filename;
        }

        // Insert scale suffix before the extension
        var regex = /(\.(?:css|svg|png))?$/i;
        var suffix = scaleSuffix(scale);
        return filename.replace(regex, suffix + "$&");
    }

    /**
     * Check if a file path is an SVG image file. The file contents are not
     * inspected, only it's existence and extension'
     *
     * @param {String} filePath
     * @return {Boolean}
     */
    function isSvgFile(filePath) {
        if (!filePath) {
            return false;
        }
        filePath = path.resolve(filePath);
        return fs.existsSync(filePath) && fs.lstatSync(filePath) && /\.svg$/.test(filePath);
    }
};
