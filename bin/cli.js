#!/usr/bin/env node
'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');
const child_process = require('child_process');

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path');
const parseSemver = require('parse-semver');
const simpleReload = require('simple-reload');
const tryRequire = require('try-require');
const _ = require('lodash');

/**
 * Modules
 * Configuration
 */
appRootPath.setPath(path.join(__dirname, '..'));

/**
 * Modules
 * Internal
 * @constant
 */
const packageJson = require(path.join(appRootPath.path, 'package.json'));
const logger = require(path.join(appRootPath.path, 'lib', 'logger'))({ namespace: packageJson.productName, timestamp: false });

/**
 * Filesystem
 * @constant
 * @default
 */
const applicationPath = path.join(appRootPath.path, packageJson.main);


/**
 * Install required Dependencies
 * @param {Object} dependencyObject - package.json dependency map
 * @param {Function} callback  - Callback
 */
let installDependencies = (dependencyObject, callback) => {
    logger.debug('installDependencies', dependencyObject);

    let cb = callback || function () {};

    // Generate list of dependencies
    let dependencyNameList = Object.keys(dependencyObject);

    // Determine uninstalled dependencies
    dependencyNameList = dependencyNameList.filter((dependencyName) => {
        const isInstalled = tryRequire.resolve(dependencyName);
        return !isInstalled;
    });

    // Generate package names
    let dependencyList = dependencyNameList.map((dependencyName) => {
        const foundVersion = dependencyObject[dependencyName];
        let parsedVersion;

        try {
            parsedVersion = parseSemver(`${dependencyName}@${foundVersion}`).version;
        } catch(err) {
            parsedVersion = foundVersion;
        }

        return `${dependencyName}@${parsedVersion}`;
    });

    // Install
    if (dependencyList.length > 0) {
        /**
         * npm install
         */
        logger.info('installing dependencies:', `"${dependencyList.join('", "')}"`);

        child_process.execSync(`npm install ${dependencyList.join(' ')} --loglevel silent`, {
            cwd: appRootPath.path,
            maxBuffer: (20000 * 1024),
            stdio: 'inherit'
        });

        logger.info(`installing dependencies complete.`);
    }

    cb(null);
};

/**
 * Launch App
 * @param {String} electronPath - Path to Electron
 * @param {String} applicationPath - Path to App
 */
let launchApplication = (electronPath, applicationPath) => {
    logger.debug('launchApplication');

    /**
     * Launch application
     */
    logger.info('application location:', `"${appRootPath.path}"`);
    logger.info('electron installation:', `"${path.relative(appRootPath.path, electronPath)}"`);

    const child = child_process.spawn(electronPath, [applicationPath], {
        cwd: appRootPath.path,
        detached: true,
        stdio: 'ignore'
    });

    /**
     * Fork process
     */
    child.unref();

    /**
     * Exit
     */
    process.on('exit', () => {
        logger.info('successfully started.');
    });

    process.exit(0);
};


/**
 * Main
 */
let main = () => {
    logger.debug('main');

    installDependencies(packageJson.devDependencies, () => {
        let interval = setInterval(() => {
            const electron = simpleReload('electron');

            if (!electron) {
                return;
            }

            launchApplication(electron, applicationPath);
            clearInterval(interval);
        }, 2000);
    });
};


/**
 * Init
 */
if (require.main === module) {
    main();
}
