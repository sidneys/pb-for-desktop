'use strict';

/**
 * Modules
 * External
 */
const fs = require('fs'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
    archiver = require('archiver'),
    builder = require('electron-packager'),
    darwinInstaller = require('appdmg'),
    windowsInstaller = require('electron-winstaller'),
    _ = require('lodash');


/**
 * Modules
 * Internal
 */
const packageJson = require('./package.json'),
    platform = require('./app/scripts/platform');


/**
 * Options for electron-packager
 */
let createBuildOptions = function(targetPlatform) {
    return {
        'dir': path.join(__dirname),
        'out': path.join(__dirname, packageJson.build.directoryStaging),
        'icon': path.join(__dirname, 'icons', targetPlatform, 'app-icon' + platform.icon(targetPlatform)),
        'iconUrl': packageJson.build.iconUrl,
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
        'app-company': packageJson.build.company,
        'app-category-type': packageJson.build.category,
        'helper-bundle-id': packageJson.build.id + '.helper',
        'app-copyright': 'Copyright © ' + new Date().getFullYear(),
        'version-string': {
            'FileDescription': packageJson.build.productDescription
        },
        'description': packageJson.build.productDescription,
        'ignore': [
            path.basename(packageJson.build.directoryStaging),
            path.basename(packageJson.build.directoryRelease),
            targetPlatform !== 'darwin' ? '/icons/darwin($|/)' : null,
            targetPlatform !== 'win32' ? '/icons/win32($|/)' : null,
            targetPlatform !== 'linux' ? '/icons/linux($|/)' : null,
            '/resources($|/)',
            'build.js',
            '.md',
            '.log',
            '/\\.DS_Store($|/)', '/\\.editorconfig($|/)', '/\\.gitignore($|/)', '/\\.idea($|/)', '/\\.jscsrc($|/)', '/\\.jshintrc($|/)', '/\\.npmignore($|/)'
        ]
    };
};


/**
 * Logger
 */
let log = function() {
    var args = Array.from(arguments);

    var title = args[0],
        text = args.slice(1).join(' '),
        textList = [];

     for (let value of text) {
        if (_.isPlainObject(value)) {
            textList.push('\r\n' + JSON.stringify(value, null, 4) + '\r\n');
        } else {
            textList.push(value);
        }
    }

    console.log('\x1b[1m%s: %s\x1b[0m', title, textList.join(' '));
};


/**
 * Commandline platform override (default: build all platforms)
 * @example > npm run build darwin
 * @example > npm run build win32
 */
let platformListCli = function() {
    return process.argv.slice(3);
};


/**
 * Create files / folders
 * @param {...*} arguments - Filesystem paths
 */
let createOnFilesystem = function() {
    var args = Array.from(arguments);
    for (let value of args) {
        mkdirp.sync(path.resolve(value));
        log('Removed', path.resolve(value));
    }
};


/**
 * Delete folders / files recursively
 * @param {...*} arguments - Filesystem paths
 */
let deleteFromFilesystem = function() {
    var args = Array.from(arguments);
    for (let value of args) {
        rimraf.sync(path.resolve(value) + '/**/*');
        log('Removed', path.resolve(value));
    }
};


/**
 * Zip folders
 * @param {String} sourceFilepath - Directory to compress
 * @param {String=} allowedExtension - Restrict inclusion to files with this extension (e.g. '.exe')
 */
let moveFolderToPackage = function(sourceFilepath, allowedExtension) {

    var source = path.resolve(sourceFilepath),
        sourceBasepath = path.dirname(source),
        sourceGlob = fs.statSync(source).isDirectory() === true ? path.basename(source) + '/**/*' : path.basename(source),
        targetExtension = '.zip',
        target = path.join(path.dirname(source), path.basename(source)) + targetExtension;

    let archive = archiver.create('zip', {}),
        output = fs.createWriteStream(target);

    output.on('close', function() {
        log('Packaging complete', target);
        rimraf.sync(source);
    });

    archive.on('error', function(err) {
        console.error(err);
    });

    archive.pipe(output);

    // packing a directory
    archive.bulk([
        {
            cwd: sourceBasepath,
            src: allowedExtension ? sourceGlob + '*' + allowedExtension : sourceGlob,
            expand: true
        }
    ]).finalize();
};


/**
 * Platform Target List
 */
var platformList = function() {
    if ((platformListCli() !== 'undefined') && (platformListCli().length > 0)) {
        return platformListCli();
    }
    return packageJson.build.platforms;
};


/**
 * Darwin Deployment
 * @param {Array} buildArtifactList - Directory to compress
 * @param {Object} buildOptions - electron-packager options object
 * @param {String} platformName - Current Platform type
 * @param {String} deployFolder - Deployment parent folder
 */
var deployDarwin = function(buildArtifactList, buildOptions, platformName, deployFolder) {

    buildArtifactList.forEach(function(buildArtifact) {

        // Deployment: Input folder
        var inputFolder = path.join(buildArtifact, buildOptions.name + '.app');

        // Deployment: Target folder
        var deploySubfolder = path.join(path.resolve(deployFolder), path.basename(buildArtifact).replace(/\s+/g, '_').toLowerCase() + '-v' + buildOptions['app-version']);

        // Deployment: Installer extension
        var deployExtension = '.dmg';

        // Deployment: Options
        var deployOptions = {
            target: path.join(deploySubfolder, path.basename(deploySubfolder) + deployExtension),
            basepath: '',
            specification: {
                'title': buildOptions['name'],
                'icon': buildOptions['icon'],
                'background': path.join(__dirname, 'icons', platformName, 'installation-background.png'),
                'contents': [
                    { 'x': 448, 'y': 344, 'type': 'link', 'path': '/Applications' },
                    { 'x': 192, 'y': 344, 'type': 'file', 'path': inputFolder }
                ]
            }
        };
        //console.dir(deployOptions);

        // Deployment: Subfolder
        deleteFromFilesystem(deploySubfolder);
        createOnFilesystem(deploySubfolder);

        // Deployment: Start
        var deployHelper = darwinInstaller(deployOptions);

        // Deployment: Result
        deployHelper.on('finish', function() {
            moveFolderToPackage(deploySubfolder, deployExtension);
        });
        deployHelper.on('error', function(err) {
            console.error('\x1b[1mPackaging error: %s\x1b[0m\r\n', err);
        });
    });
};


/**
 * Windows Deployment
 * @param {Array} buildArtifactList - Directory to compress
 * @param {Object} buildOptions - electron-packager options object
 * @param {String} platformName - Current Platform type
 * @param {String} deployFolder - Deployment parent folder
 */
var deployWindows = function(buildArtifactList, buildOptions, platformName, deployFolder) {

    buildArtifactList.forEach(function(buildArtifact) {

        // Deployment: Input folder
        var inputFolder = path.join(buildArtifact);

        // Deployment: Target folder
        var deploySubfolder = path.join(path.resolve(deployFolder), path.basename(buildArtifact).replace(/\s+/g, '_').toLowerCase() + '-v' + buildOptions['app-version']);

        // Deployment: Installer extension
        var deployExtension = '.exe';

        // Deployment: Options
        var deployOptions = {
            appDirectory: inputFolder,
            outputDirectory: deploySubfolder,
            setupExe: path.basename(buildArtifact).replace(/\s+/g, '_').toLowerCase() + deployExtension,
            exe: buildOptions['name'] + '.exe',
            authors: buildOptions['app-company'],
            title: buildOptions['name'],
            iconUrl: buildOptions['iconUrl'],
            setupIcon: buildOptions['icon'],
            description: buildOptions['description']
        };
        //console.dir(deployOptions);

        // Deployment: Subfolder
        deleteFromFilesystem(deploySubfolder);
        createOnFilesystem(deploySubfolder);

        // Deployment: Start
        var deployHelper = windowsInstaller.createWindowsInstaller(deployOptions);

        // Deployment: Result
        deployHelper.then(function() {
            moveFolderToPackage(deploySubfolder, deployExtension);
        }, function(err) {
            console.error('\x1b[1mPackaging error: %s\x1b[0m', err);
        });
    });
};


/**
 * Linux  Deployment
 * @param {Array} buildArtifactList - Directory to compress
 * @param {Object} buildOptions - electron-packager options object
 * @param {String} platformName - Current Platform type
 * @param {String} deployFolder - Deployment parent folder
 */
var deployLinux = function(buildArtifactList, buildOptions, platformName, deployFolder) {

    buildArtifactList.forEach(function(buildArtifact) {



    });
};


/**
 * Print Info
 */
log('Project', packageJson.build.productName, packageJson.name, packageJson.version);
log('Target Platforms', platformList());


/**
 * Prepare Directories
 */
deleteFromFilesystem(packageJson.build.directoryStaging, packageJson.build.directoryRelease);
createOnFilesystem(packageJson.build.directoryStaging, packageJson.build.directoryRelease);


/**
 * Building
 */
platformList().forEach(function(target) {
    var options = createBuildOptions(target);

    builder(options, function(err, result) {

        if (err) { return console.error(err); }

        log('Build complete', target);

        if (target.startsWith('darwin')) {
            deployDarwin(result, options, target, packageJson.build.directoryRelease);
        } else if (target.startsWith('win')) {
            deployWindows(result, options, target, packageJson.build.directoryRelease);
        } else if (target.startsWith('linux')) {
            deployLinux(result, options, target, packageJson.build.directoryRelease);
        }
    });
});
