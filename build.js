'use strict';

/**
 * Commandline platform override (default: build all platforms)
 * @example > npm run build darwin
 * @example > npm run build win32
 */
var platformOverride = process.argv.slice(3)[0];

/**
 * Modules
 * External
 */
const packager = require('electron-packager'),
      util = require('util'),
      path = require('path');

/**
 * Modules
 */
const packageJson = require('./package.json'),
      platform = require('./app/scripts/platform');

/**
 * @constant
 */
const options = {
    'dir': path.join(__dirname),
    'out': path.join(__dirname, packageJson.build.folder),
    'icon': path.join(__dirname, 'icons', platform.type, 'app-icon' + platform.icon(platform.type)),
    'platform': platformOverride || packageJson.build.platform || 'all',
    'arch': 'all',
    'prune': true,
    'asar': true,
    'overwrite': true,
    'name': packageJson.build.name,
    'version': packageJson.build.electron,
    'app-version': packageJson.version,
    'build-version': packageJson.build.number,
    'app-bundle-id': packageJson.build.id,
    'app-category-type': packageJson.build.category,
    'helper-bundle-id': packageJson.build.id + '.helper',
    'app-copyright': 'Copyright © ' + new Date().getFullYear(),
    'version-string': {
        'FileDescription': packageJson.description
    }
};

/**
 * Print Info
 */
console.log('\x1b[1mBuilding:\x1b[0m\r\n%s (%s@%s)', options.name, packageJson.name, packageJson.version);
console.log('\x1b[1mPlatform:\x1b[0m\r\n%s', options.platform);
console.log('\x1b[1mConfiguration:\x1b[0m\r\n%s', util.inspect(options, {showHidden: false, depth: null, colors: true}));

/**
 * Run Build
 */
packager(options, function(err) {
    if (err) {
        return console.error(err);
    }

    console.log('\x1b[1mBuilding Complete.\x1b[0m');
});
