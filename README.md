# grunt-multicon

Multicon is an easy way to generate multiple versions of CSS icons based on SVG images using [Grunt](http://gruntjs.com).
This project started as a fork of [grunticon](https://github.com/filamentgroup/grunticon) but has converted from its origin and taken a different approach to generating icons.

Multicon takes a list of SVG images and generates three icon stylesheets based
on those icons:

  1. A stylesheet with SVG data URIs
  2. A stylesheet with PNG data URIs
  3. A stylesheet with fallback URLs to PNG images

Each stylesheet contains CSS classes for each source image that can be used to
set the background of an HTML element with the icon.

Depending on the browser(s) you are supporting you can load any of the
stylesheets to use the CSS classes generated from the source images.

## Getting started

Multicon is a Grunt task that can be used with Grunt 0.4. Besides Grunt it requires [PhantomJS](http://phantomjs.org/) to be installed for rendering PNG version of the icons.

The `grunt-multicon` module can be installed like any other Node.js module through [NPM](http://npmjs.org):

```
$ npm install [--production] grunt-multicon
```

After the module is installed it can be used from the `Gruntfile.js` file in your project by loading it:

```
grunt.loadNpmTasks('grunt-multicon');
```

## Configuration

This is an example task defintion from a `Gruntfile.js` file:
```
"multicon": {
  "example": {
    "options": {
      "css": {
        "prefix": "icon-",
        "baseurl": "/icons"
      }
    },
    "src":  [ "example/source/*.svg" ],
    "dest": "example/output"
  }
}
```

### Options

  - **css**
    - **prefix**: Prefix to use for CSS classes.
    - **baseurl**: Base URL for generated icons paths in the fallback CSS file.
  - **sheets**
    - **svg**: Name for the SVG data URI stylesheet.
    - **png**: Name for the PNG data URI stylesheet.
    - **fallback**: Name for the fallback stylesheet.
  - **folder**: Name for the PNG icon folder.
  - **basepath**: Base path for rendered PNG icons. This will be stripped off the path of the source icons.
  - **scales**: The scaled version for each icon that need to be generated.

## License

`grunt-multicon` is licensed under the MIT license. See the LICENSE file for more details.

    Copyright (c) 2013, Stéphan Kochen, Mattijs Hoitink, Two Screen.
    Copyright (c) 2012 Scott Jehl, Filament Group, Inc.


### Example icons attribution

The awesome example SVG icons are from the [Tango Desktop Project](http://tango.freedesktop.org/) and released in the Public Domain.
