#!/usr/bin/env node
'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const childProcess = require('child_process');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;
const fkill = require('fkill');
const glob = require('glob');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))();
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));

/**
 * Developer Mode
 * @global
 */
let devMode = (process.env.NODE_ENV === 'debug');

/**
 *  @global
 */
let directoryOutput = path.join(appRootPath, packageJson.build.directories.output);

/**
 * App
 * @global
 */
let appProductName = packageJson.productName || packageJson.name,
    appName = packageJson.name,
    appVersion = packageJson.version;

/**
 * Get Name of active NPM Script
 *  @global
 */
let npmScript = process.env['npm_lifecycle_event'];

/**
 * Build
 */
let build = function() {
    logger.log('Building', appProductName);
    childProcess.execSync(packageJson.scripts.build, { cwd: appRootPath, stdio: [0, 1, 2] });
};


/**
 * Quit locally running application processes, then install and launch
 */
let install = function() {

    if (isDebug) {
        process.env.DEBUG = devMode;
    }

    /**
     *  macOs
     */
    if (platformHelper.isMacOS) {
        let sourceFilePath = path.normalize(path.join(directoryOutput, 'mac', `${appProductName}.app`)),
            destinationFilePath = path.join('/Applications', `${appProductName}.app`);

        // DEBUG
        logger.debug('platformHelper', 'isMacOS', 'sourceFilePath', sourceFilePath);
        logger.debug('platformHelper', 'isMacOS', 'destinationFilePath', destinationFilePath);

        logger.log('Closing application');
        fkill(appProductName, { force: true });
        logger.log('Removing application');
        fs.removeSync(destinationFilePath);
        logger.log('Installing application');
        fs.copySync(sourceFilePath, destinationFilePath, { clobber: true, preserveTimestamps: true });
        logger.log('Starting application');
        childProcess.execSync(`open "${destinationFilePath}"`);
    }

    /**
     *  Windows
     */
    if (platformHelper.isWindows) {
        let installerFilePathPattern = path.join(directoryOutput, 'win', `*${appProductName}*${appVersion}.exe`),
            installerFilePathList = glob.sync(installerFilePathPattern),
            installerFilePath = installerFilePathList[0];

        // DEBUG
        logger.debug('platformHelper', 'isWindows', 'installerFilePathPattern', installerFilePathPattern);
        logger.debug('platformHelper', 'isWindows', 'installerFilePathList', installerFilePathList);
        logger.debug('platformHelper', 'isWindows', 'installerFilePath', installerFilePath);

        logger.log('Closing application');
        fkill(appProductName, { force: true });
        logger.log('Installing application');
        logger.log('Starting application');
        childProcess.execSync(`start "" "${installerFilePath}"`, { stdio: [0, 1, 2] });
    }

    /**
     *  Linux
     */
    if (platformHelper.isLinux) {
        let installerArch;

        switch (os.arch()) {
            case 'arm7l':
                installerArch = 'arm';
                break;
            case 'x64':
                installerArch = 'amd64';
                break;
            case 'ia32':
                installerArch = 'i386';
                break;
        }

        let installerFilePathPattern = path.normalize(path.join(directoryOutput, `*${appName}*${appVersion}*${installerArch}*.deb`)),
            installerFilePathList = glob.sync(installerFilePathPattern),
            installerFilePath = installerFilePathList[0],
            destinationFilePath = path.join('/usr/bin', appName);

        // DEBUG
        logger.debug('platformHelper', 'isLinux', 'installerFilePathPattern', installerFilePathPattern);
        logger.debug('platformHelper', 'isLinux', 'installerFilePathList', installerFilePathList);
        logger.debug('platformHelper', 'isLinux', 'destinationFilePath', destinationFilePath);

        logger.log('Closing application');
        fkill(appName, { force: true });
        logger.log('Installing application');
        childProcess.execSync(`sudo dpkg --install --force-overwrite "${installerFilePath}"`);
        logger.log('Starting application');
        let child = childProcess.spawn(destinationFilePath, [], { detached: true, stdio: 'ignore' });
        child.unref();
    }
};


/**
 * Main
 */
if (require.main === module) {

    if (npmScript && npmScript.includes('rebuild')) {
        build();
    }

    install();

    process.exit(0);
}
