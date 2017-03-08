#!/usr/bin/env node
'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const childProcess = require('child_process');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path').path;
const fkill = require('fkill');
const glob = require('glob');

/**
 * Modules
 * Internal
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * Application
 * @constant
 * @default
 */
const appProductName = packageJson.productName || packageJson.name;
const appName = packageJson.name;
const appVersion = packageJson.version;

/**
 * Filesystem
 * @constant
 * @default
 */
const targetDirectory = path.join(appRootPath, packageJson.build.directories.output);


/**
 * Build
 */
let build = () => {
    logger.debug('build');

    childProcess.execSync(packageJson.scripts.build, { cwd: appRootPath, stdio: [0, 1, 2] });
};

/**
 * Quit application, install and launch
 */
let main = () => {
    /**
     *  Forward debug environment
     */
    if (isDebug) {
        process.env.DEBUG = true;
    }

    /**
     * macOS
     */
    if (platformHelper.isMacOS) {
        let sourceFilePath = path.normalize(path.join(targetDirectory, 'mac', `${appProductName}.app`));
        let destinationFilePath = path.join('/Applications', `${appProductName}.app`);

        // DEBUG
        logger.debug('macos', 'sourceFilePath', sourceFilePath);
        logger.debug('macos', 'destinationFilePath', destinationFilePath);

        logger.log('closing');
        fkill(appProductName, { force: true });
        logger.log('removing application');
        fs.removeSync(destinationFilePath);
        logger.log('installing application');
        fs.copySync(sourceFilePath, destinationFilePath, { clobber: true, preserveTimestamps: true });
        logger.log('starting');
        childProcess.execSync(`open "${destinationFilePath}"`);
    }

    /**
     * Windows
     */
    if (platformHelper.isWindows) {
        let installerFilePathPattern = path.join(targetDirectory, 'win', `*${appProductName}*${appVersion}.exe`);
        let installerFilePathList = glob.sync(installerFilePathPattern);
        let installerFilePath = installerFilePathList[0];

        // DEBUG
        logger.debug('windows', 'installerFilePathPattern', installerFilePathPattern);
        logger.debug('windows', 'installerFilePathList', installerFilePathList);
        logger.debug('windows', 'installerFilePath', installerFilePath);

        logger.log('closing');
        fkill(appProductName, { force: true });
        logger.log('starting');
        childProcess.execSync(`start "" "${installerFilePath}"`, { stdio: [0, 1, 2] });
    }

    /**
     * Linux
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

        let installerFilePathPattern = path.normalize(path.join(targetDirectory, `*${appName}*${appVersion}*${installerArch}*.deb`));
        let installerFilePathList = glob.sync(installerFilePathPattern);
        let installerFilePath = installerFilePathList[0];
        let destinationFilePath = path.join('/usr/bin', appName);

        // DEBUG
        logger.debug('linux', 'installerFilePathPattern', installerFilePathPattern);
        logger.debug('linux', 'installerFilePathList', installerFilePathList);
        logger.debug('linux', 'destinationFilePath', destinationFilePath);

        logger.log('closing');
        fkill(appName, { force: true });
        logger.log('installing');
        childProcess.execSync(`sudo dpkg --install --force-overwrite "${installerFilePath}"`);
        logger.log('starting');
        let child = childProcess.spawn(destinationFilePath, [], { detached: true, stdio: 'ignore' });
        child.unref();
    }
};


/**
 * Main
 */
if (require.main === module) {
    if (process.env.npm_lifecycle_event.includes('build')) { build(); }

    main();

    process.exit(0);
}
