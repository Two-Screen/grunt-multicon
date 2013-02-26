"use strict";

module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        watch: {
            all: {
                files: '<%= jshint.all.files %>',
                tasks: 'default'
            }
        },
        clean: {
            example: [ "example/output" ]
        },
        multicon: {
            example: {
                options: {
                    folder:   'icons',
                    basepath: 'example/source'
                },
                src: [ 'example/source/*.svg' ],
                dest: 'example/output'
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
                src: ['Gruntfile.js', 'tasks/**/*.js']
            }
        }
    });

    // Load NPM tasks
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-clean');

    // Load local tasks.
    grunt.loadTasks('tasks');

    // Define default task.
    grunt.registerTask('default', ['jshint', 'clean', 'multicon']);

    // test task shim
    grunt.registerTask('test', ['nodeunit']);

};
