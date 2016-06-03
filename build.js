'use strict';

/**
 * Modules
 * External
 */
const packager = require('electron-packager'),
    fs = require('fs'),
    appdmg = require('appdmg'),
    path = require('path');


/**
 * Modules
 */
const packageJson = require('./package.json'),
    platform = require('./app/scripts/platform');


/**
 * Options for Packager
 */
let getOptions = function(targetPlatform) {
    return {
        'dir': path.join(__dirname),
        'out': path.join(__dirname, packageJson.build.directory),
        'icon': path.join(__dirname, 'icons', targetPlatform, 'app-icon' + platform.icon(targetPlatform)),
        'platform': targetPlatform,
        'arch': 'all',
        'prune': true,
        'asar': true,
        'overwrite': true,
        'name': packageJson.build.productName,
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
};

/**
 * Commandline platform override (default: build all platforms)
 * @example > npm run build darwin
 * @example > npm run build win32
 */
let platformListCli = process.argv.slice(3);

/**
 * Platform Target List
 */
var platformList = function() {
    if ((platformListCli !== 'undefined') && (platformListCli.length > 0)) {
        return platformListCli;
    }
    return packageJson.build.platform || 'all';
};


/**
 * Print Info
 */
console.log('\x1b[1mProject:\x1b[0m\r\n%s (%s@%s)', packageJson.build.productName, packageJson.name, packageJson.version);
console.log('\x1b[1mTargets:\x1b[0m\r\n%s', platformList().join('\r\n'));


/**
 * Packaging
 */
var packageDarwin = function(assetLocationList, options, target) {
    assetLocationList.forEach(function(folder) {
        var packageFilepath = path.join(options.out, options.name + '.dmg');

        try {
            fs.unlinkSync(packageFilepath);
            console.log('Previous package removed.');
        } catch (err) {}

        var packageHelper = appdmg({
            target: packageFilepath,
            basepath: '',
            specification: {
                'title': options.name,
                'icon': options.icon,
                'background': path.join(__dirname, 'icons', target, 'installation-background.png'),
                'contents': [
                    { 'x': 448, 'y': 344, 'type': 'link', 'path': '/Applications' },
                    { 'x': 192, 'y': 344, 'type': 'file', 'path': path.join(folder, options.name + '.app') }
                ]
            }
        });
        packageHelper.on('finish', function() { console.log('\x1b[1mPackaging complete:\x1b[0m\r\n%s', packageFilepath); });
        packageHelper.on('error', function(err) { console.error('\x1b[1mPackaging error:\x1b[0m\r\n%s', err); });
    });
};


/**
 * Building
 */
platformList().forEach(function(target) {
    var options = getOptions(target);

    packager(options, function(err, result) {
        if (err) {
            return console.error(err);
        }
        console.log('\x1b[1mBuilding "%s" complete. Result:\x1b[0m\r\n%s', target, result.join('\r\n'));

        if (target === 'darwin') {
            packageDarwin(result, options, target);
        }
    });
});
