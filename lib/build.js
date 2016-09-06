'use strict';


/**
 * Modules: Node
 * @global
 */
const path = require('path');


/**
 * Modules: Third Party
 * @global
 */
const _ = require('lodash'),
    fs = require('fs.extra'),
    rimraf = require('rimraf'),
    glob = require('glob'),
    electronPackager = require('electron-packager');


/**
 * Modules: Internal
 * @global
 */
const moduleRoot = path.join(__dirname, '..'),
    packageJson = require(path.join(moduleRoot, 'package.json')),
    platformHelper = require(path.join(moduleRoot, 'lib', 'platform-helper')),
    logger = require(path.join(moduleRoot, 'lib', 'logger'));


/**
 * Debug
 * @constant
 * @global
 */
const debugMode = process.env['DEBUG'];


/**
 * Directories
 * @constant
 * @global
 */
const directoryBuild = path.join(moduleRoot, packageJson.build.directoryBuild),
    directoryRelease = path.join(directoryBuild, 'release'),
    directoryStaging = path.join(directoryBuild, 'staging'),
    directoryAssets = path.join(moduleRoot, packageJson.build.directoryIcons);


/**
 * Ignored files
 * @constant
 * @global
 */
const fileIgnoreList = [
    'appveyor.yml',
    '.editorconfig',
    '.DS_Store',
    '.gitignore',
    '.idea',
    '.jscsrc',
    '.jshintrc',
    '.npmignore',
    '.travis.yml',
    path.relative(moduleRoot, directoryStaging),
    path.relative(moduleRoot, directoryRelease)
];


/**
 * Packager
 * - macOS: appdmg
 * - Windows: electron-winstaller
 * - Linux: electron-installer-debian
 */
let darwinInstaller, windowsInstaller, linuxInstaller;

if (platformHelper.isDarwin) {
    darwinInstaller = require('appdmg');
    windowsInstaller = require('electron-winstaller');
    linuxInstaller = require('electron-installer-debian');
}

if (platformHelper.isWindows) {
    windowsInstaller = require('electron-winstaller');
}

if (platformHelper.isLinux) {
    linuxInstaller = require('electron-installer-debian');
}


/**
 * Create configurations for electron-packager
 */
let createBuildConfiguration = function(platform) {

    let options = _.clone(packageJson.build);

    let buildVersion = _(new Date().toJSON()).replace(/T|Z|-|:|\./g, ''),
        icon = path.join(directoryAssets, platform, 'icon-app' + platformHelper.iconExtension(platform));

    let ignore = fileIgnoreList;
    // Add assets for other platforms
    for (let p of options.platforms) {

        // DEBUG
        logger.debug('createBuildConfiguration', 'p', p);
        logger.debug('createBuildConfiguration', 'options', options);

        if (platform !== p) {
            ignore.push(path.relative(moduleRoot, path.join(directoryAssets, p)));
            //ignore.push('/icons/' + p);
        }
    }


    // DEBUG
    logger.debug('createBuildConfiguration', 'ignore', ignore);

    // Regexify ignore list entries
    for (let i in ignore) {
        ignore[i] = '/' + ignore[i] + '($|/)';

        ignore[i] = ignore[i].replace(/\\/g, '\/');
        ignore[i] = ignore[i].replace(/\./g, '\\.');
    }

    // NuGet-compliant filename
    let productName = options.productName;
    if (platformHelper.isWindows) {
        productName = productName.replace(/-|\s+/g, '_');
    }

    // DEBUG
    logger.debug('createBuildConfiguration', 'ignore', ignore);

    return {
        'app-bundle-id': options.id,
        'app-category-type': options.category,
        'app-company': options.company,
        'app-copyright': 'Copyright © ' + new Date().getFullYear(),
        'app-version': options.version,
        'arch': 'all',
        'asar': false,
        'build-version': buildVersion,
        'description': options.productDescription,
        'dir': moduleRoot,
        'helper-bundle-id': options.id + '.helper',
        'icon': icon,
        'iconUrl': options.iconUrl,
        'ignore': ignore,
        'name': productName,
        'out': directoryStaging,
        'overwrite': true,
        'platform': platform,
        'productDescription': options.productDescription,
        'productName': productName,
        'prune': true,
        'version': options.electronVersion,
        'win32metadata': {
            CompanyName: options.company,
            FileDescription: options.productDescription,
            OriginalFilename: productName,
            FileVersion: options.version,
            ProductVersion: options.version,
            ProductName: productName,
            InternalName: productName
        }
    };
};


/**
 * Commandline platform override (default: build all platforms)
 * @example > npm run build darwin
 * @example > npm run build win32
 */
let createPlatformListCli = function() {
    return process.argv.slice(3);
};


/**
 * Check filenames for architecture
 * @return {String} Found architecture
 */
let parseArchitecture = function(search) {
    return search.match(/arm|arm64|ia32|mips|mipsel|ppc|ppc64|s390|s390x|x32|x64|x86/);
};


/**
 *
 * @example > npm run build darwin
 * @example > npm run build win32
 */

/**
 * Strip wildcards from package names, convert to lowercase add version info
 * @param {String} file - Path to package
 * @param {String=} fileVersion - Package version
 * @param {String=} fileArchitecture - Package version
 * @param {Boolean=} fullPath - Add full path
 * @param {Boolean=} removeExtension - Add extension
 * @return {String}
 */
let getSafePackageFileName = function(file, fileVersion, fileArchitecture, fullPath, removeExtension) {
    let fileName = _.toLower(path.basename(file)),
        fileExtension = path.extname(file);

    // Remove extension
    fileName = fileName.replace(/\.[^/.]+$/, '');

    // Replace whitespace
    fileName = _(fileName.replace(/\s+/g, '_'));

    // Add version
    if (fileVersion) {
        fileName = fileName + '-v' + fileVersion;
    }

    // Add arch
    if (fileArchitecture) {
        fileName = fileName + '-' + fileArchitecture;
    }

    // Add extension
    if (!removeExtension) {
        fileName = fileName + fileExtension;
    }

    // Add Path
    if (path.dirname(file) && fullPath) {
        fileName = path.join(path.dirname(file), fileName);
    }

    // DEBUG
    logger.debug('getSafePackageFileName', 'fileName', fileName);

    return fileName;
};


/**
 * Create folders
 * @param {...*} arguments - Filesystem paths
 */
let createDirectorySync = function() {
    let args = Array.from(arguments);
    for (let directoryPath of args) {
        let target = path.resolve(directoryPath);

        fs.mkdirp.sync(target);

        // DEBUG
        logger.debug('createDirectorySync', target);
    }
};


/**
 * Delete directory
 * @param {String} directoryPath - Path
 * @param {Boolean=} contentsOnly - Keep directory intact
 * @param {Function=} callback - Completion callback
 */
let deleteDirectory = function(directoryPath, contentsOnly, callback) {

    let cb = callback || function() {};

    let target = path.normalize(path.resolve(directoryPath));

    if (contentsOnly) {
        target = path.join(target, '**', '*');
    }

    rimraf(target, {}, function(err) {
        if (err) {
            logger.error('deleteDirectory', target, err);
            return cb(err);
        }

        cb(null);

        // DEBUG
        logger.debug('deleteDirectory', target);
    });
};



/**
 * Delete directory synchronously
 * @param {String} directoryPath - Path
 * @param {Boolean=} contentsOnly - Keep directory intact
 */
let deleteDirectorySync = function(directoryPath, contentsOnly) {

    let target = path.normalize(path.resolve(directoryPath));

    if (contentsOnly) {
        target = path.join(target, '**', '*');
    }

    rimraf.sync(target);

    // DEBUG
    logger.debug('deleteDirectorySync', target);
};


/**
 * Build platforms
 * @returns {Array} - List of platforms to build for
 */
let createPlatformList = function() {

    // Get platforms from package.json
    let platformList = _.clone(packageJson.build.platforms) || [];

    // If specified, use platform from commandline
    if ((createPlatformListCli() !== 'undefined') && (createPlatformListCli().length > 0)) {
        platformList = createPlatformListCli();
    }

    // Allow macOS builds only on macOS platform
    if (!platformHelper.isDarwin) {
        _.pull(platformList, 'darwin');
    }

    // Do not build other platforms on Windows
    if (platformHelper.isWindows) {
        _.pull(platformList, 'darwin');
        _.pull(platformList, 'linux');
    }

    // DEBUG
    logger.debug('createPlatformList', platformList);

    return platformList;
};


/**
 * Package all Platforms
 * @param {String} platformName - darwin, win32, linux
 * @param {String} sourceArtifact - Application to package
 * @param {String} targetDirectory - Deployment target folder
 * @param {Object} buildOptions - electron-packager options object
 * @param {Function=} callback - Completion callback
 */
let packageArtifact = function(platformName, sourceArtifact, targetDirectory, buildOptions, callback) {

    let cb = callback || function() {};

    let platformPackager = {};

    // DEBUG
    logger.debug('platformPackager', platformName, 'sourceArtifact', sourceArtifact);
    logger.debug('platformPackager', platformName, 'targetDirectory', targetDirectory);
    // logger.debug('platformPackager', platformName, ' buildOptions', buildOptions);

    // macOS
    platformPackager.darwin = function() {
        let architectureName = parseArchitecture(sourceArtifact),
            targetFileName = getSafePackageFileName(buildOptions['name'], buildOptions['app-version'], architectureName, null, true),
            targetSubdirectory = path.join(targetDirectory, targetFileName),
            targetExtension = '.dmg',
            sourcesFilePath = path.join(sourceArtifact, buildOptions['name'] + '.app'),
            targetFilePath = path.join(targetDirectory, path.basename(targetSubdirectory) + targetExtension);

        // Options
        let deployOptions = {
            arch: architectureName,
            target: targetFilePath,
            basepath: '',
            specification: {
                'title': buildOptions['productName'],
                'window': {
                    'size': {
                        'width': 640,
                        'height': 240
                    }
                },
                'contents': [
                    { 'x': 608, 'y': 95, 'type': 'link', 'path': '/Applications' },
                    { 'x': 192, 'y': 95, 'type': 'file', 'path': sourcesFilePath },
                    { 'x': 10000, 'y': 10000, 'type': 'position', 'path': '.background' },
                    { 'x': 10000, 'y': 10000, 'type': 'position', 'path': '.DS_Store' },
                    { 'x': 10000, 'y': 10000, 'type': 'position', 'path': '.Trashes' },
                    { 'x': 10000, 'y': 10000, 'type': 'position', 'path': '.VolumeIcon.icns' }
                ]
            }
        };

        // DEBUG
        logger.debug('packagePlatform', platformName, 'deployOptions', deployOptions);

        // Prepare working directories
        deleteDirectorySync(targetFilePath);

        // Package
        let deployHelper = darwinInstaller(deployOptions);

        deployHelper.on('finish', function() {
            // DEBUG
            logger.debug('platformPackager', platformName, 'targetFilePath', targetFilePath);

            cb(null, targetFilePath);
        });
        deployHelper.on('error', function(err) {
            if (err) {
                logger.error('platformPackager', platformName, 'deployHelper', err);
                return cb(err);
            }
        });
    };


    // Windows
    platformPackager.win32 = function() {
        let architectureName = parseArchitecture(sourceArtifact),
            targetFileName = getSafePackageFileName(buildOptions['productName'], buildOptions['app-version'], architectureName),
            targetSubdirectory = path.join(targetDirectory, targetFileName),
            targetExtension = '.exe',
            sourcesFilePath = path.join(targetSubdirectory, buildOptions['productName'] + 'Setup' + targetExtension),
            targetFilePath = path.join(targetDirectory, targetFileName + targetExtension),
            loadingGif = path.join(directoryAssets, platformName, 'background-setup.gif');

        // Options
        let deployOptions = {
            arch: architectureName,
            appDirectory: sourceArtifact,
            outputDirectory: targetSubdirectory,
            loadingGif: loadingGif,
            noMsi: true,
            exe: buildOptions['productName'] + '.exe',
            version: buildOptions['app-version'],
            authors: buildOptions['app-company'],
            title: buildOptions['productName'],
            productName: buildOptions['productName'],
            name: buildOptions['name'],
            iconUrl: buildOptions['iconUrl'],
            setupIcon: buildOptions['icon'],
            description: buildOptions['productDescription']
        };

        // DEBUG
        logger.debug('packagePlatform', platformName, 'deployOptions', deployOptions);

        // Prepare working directories
        deleteDirectorySync(targetSubdirectory, true);
        deleteDirectorySync(targetFilePath);

        // Package
        if (debugMode) {
            process.env['DEBUG'] = 'electron-windows-installer:main';
        }
        let deployHelper = windowsInstaller.createWindowsInstaller(deployOptions);

        deployHelper
            .then(function() {
                // Rename
                fs.rename(sourcesFilePath, targetFilePath, function(err) {

                    if (err) {
                        logger.error('deployHelper', platformName, 'fs.rename', err);
                        return cb(err);
                    }

                    // Remove working directories
                    deleteDirectory(targetSubdirectory, false, function(err) {
                        if (err) {
                            logger.error('deployHelper', platformName, 'deleteDirectory', err);
                            return cb(err);
                        }

                        cb(null, targetFilePath);
                    });
                });
            }, function(err) {
                if (err) {
                    logger.error('deployHelper', platformName, err);
                    return cb(err);
                }
            });
    };


    // Linux
    platformPackager.linux = function() {
        let architectureName = parseArchitecture(sourceArtifact),
            targetExtension = '.deb';

        // Options
        let deployOptions = {
            arch: architectureName,
            src: sourceArtifact,
            dest: targetDirectory,
            rename: function(dest) {

                let filename = getSafePackageFileName(buildOptions['name'] + targetExtension, buildOptions['app-version'], architectureName);

                // DEBUG
                logger.debug('platformPackager', platformName, 'rename', filename);

                return path.join(dest, filename);
            },
            bin: buildOptions['name']
        };

        // DEBUG
        logger.debug('packagePlatform', platformName, 'deployOptions', deployOptions);

        // Package
        linuxInstaller(deployOptions, function(err) {
            if (err) {
                logger.error('linuxInstaller', err);
                return cb(err);
            }

            // DEBUG
            logger.debug('platformPackager', platformName);

            cb(null);
        });
    };

    platformPackager[platformName]();
};


/**
 * Build, Package all Platforms
 * @param {Function..} callback - Completion callback
 */
let buildAndPackage = function(callback) {

    let cb = callback || function() {};

    let platformList = createPlatformList();


    logger.log('Project', packageJson.build.productName, packageJson.build.version);

    // DEBUG
    logger.debug('platformList', platformList.join(', '));

    // Prepare working directories
    createDirectorySync(directoryStaging, directoryRelease);

    /**
     * Recurse Platforms with nested callbacks
     */
    let createBinaryForPlatformRecursive = function(platformIndex) {

        let platformName = platformList[platformIndex];

        if (platformName) {
            let buildOptions = createBuildConfiguration(platformName);

            // DEBUG
            logger.debug('createBinaryForPlatformRecursive', 'buildOptions', buildOptions);

            electronPackager(buildOptions, function(err, archBinaryList) {
                if (err) { return cb(err); }

                /**
                 * Recurse Architecture-specific builds
                 */
                // DEBUG
                logger.debug('electronPackager', (_(archBinaryList).map(function(n) { return path.relative(moduleRoot, n); })).join(' '), 'ok');
                let createDeploymentForArchitectureRecursive = function(archIndex) {
                    let sourceArtifact = archBinaryList[archIndex],
                        targetDirectory = directoryRelease;

                    // DEBUG
                    logger.debug('createDeploymentForArchitectureRecursive', 'sourceArtifact', sourceArtifact);
                    logger.debug('createDeploymentForArchitectureRecursive', 'targetDirectory', targetDirectory);

                    return packageArtifact(platformName, sourceArtifact, targetDirectory, buildOptions, function(err) {
                        if (err) { return cb(err); }

                        if ((archIndex + 1) !== archBinaryList.length) {
                            return createDeploymentForArchitectureRecursive(archIndex + 1);
                        }

                        if ((platformIndex + 1) !== platformList.length) {
                            return createBinaryForPlatformRecursive(platformIndex + 1);
                        }

                        cb(null, targetDirectory);
                    });
                };

                // Init arch recursion
                createDeploymentForArchitectureRecursive(0);
            });
        }
    };

    // Init platform recursion
    createBinaryForPlatformRecursive(0);
};


/**
 * Initialize main process if called from CLI
 */
if (require.main === module) {

    buildAndPackage(function(err, result) {
        if (err) {
            logger.error('buildAndPackage', err);
            return process.exit(1);
        }

        glob(path.join(result, '*.*'), { cwd: moduleRoot }, function(err, files) {
            for (let file of files) {
                logger.log('Artifact ready', file);
            }
            process.exit(0);
        });
    });
}


/**
 * exports
 */
module.exports = {
    build: buildAndPackage
};
