"use strict";

module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        nodeunit: {
            all: {
                src: ['test/**/*.js']
            }
        },
        watch: {
            all: {
                files: '<%= jshint.all.files %>',
                tasks: 'default'
            }
        },
        multicon: {
            example: {
                options: {
                    // required config
                    src: "example/source/",
                    dest: "example/output/",

                    // optional grunticon config properties

                    // CSS filenames
                    datasvgcss: "icons.data.svg.css",
                    datapngcss: "icons.data.png.css",
                    urlpngcss: "icons.fallback.css",

                    // preview HTML filename
                    previewhtml: "preview.html",

                    // grunticon loader code snippet filename
                    loadersnippet: "grunticon.loader.txt",

                    // folder name (within dest) for png output
                    pngfolder: "png/",

                    // prefix for CSS classnames
                    cssprefix: "icon-wee-",

                    // css file path prefix - this defaults to "/" and will be placed before the "dest" path when stylesheets are loaded.
                    // This allows root-relative referencing of the CSS. If you don't want a prefix path, set to to ""
                    cssbasepath: "/"
                }
            }
        },
        jshint: {
            options: {
                strict: true,
                curly: true,
                eqeqeq: true,
                immed: true,
                latedef: false,
                newcap: true,
                noarg: true,
                sub: true,
                undef: true,
                boss: true,
                eqnull: true,
                node: true,
                es5: true
            },
            all: {
                src: ['Gruntfile.js', 'tasks/**/*.js', 'test/**/*.js']
            }
        }
    });

    // Load NPM tasks
    grunt.loadNpmTasks('grunt-contrib-nodeunit');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-jshint');

    // Load local tasks.
    grunt.loadTasks('tasks');

    // Define default task.
    grunt.registerTask('default', ['jshint',  'multicon']);

    // test task shim
    grunt.registerTask('test', ['nodeunit']);

};
