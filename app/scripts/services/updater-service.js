'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const os = require('os');
const path = require('path');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const electron = require('electron');
const { app, BrowserWindow } = electron;

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;
const semverCompare = require('semver-compare');
const { autoUpdater } = require('electron-updater');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const messengerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'messenger-service'));
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const settings = require(path.join(appRootPath, 'app', 'scripts', 'configuration', 'settings'));


/**
 * App
 * @global
 * @constant
 */
const appProductName = packageJson.productName || packageJson.name;
const appVersion = packageJson.version;

/**
 * @default
 * @global
 */
let isCheckingOrInstallingUpdates = false;


/**
 * Singleton
 * @global
 */
let updateManager;

/**
 * Update Manager
 * @class
 * @returns autoUpdater
 */
class UpdateManager {
    constructor() {
        if (platformHelper.isLinux) { return; }

        this.init();
    }

    init() {
        logger.debug('updater-service', 'init()');

        // Set Logger
        autoUpdater.logger = logger;

        /** @listens AutoUpdater#on */
        autoUpdater.on('error', (error) => {
            logger.error('updater-service', 'AutoUpdater:error', error.message);

            isCheckingOrInstallingUpdates = false;
        });

        /** @listens AutoUpdater#on */
        autoUpdater.on('checking-for-update', () => {
            logger.log('updater-service', 'AutoUpdater:checking-for-update');

            isCheckingOrInstallingUpdates = true;
        });

        /** @listens AutoUpdater#on */
        autoUpdater.on('update-available', () => {
            logger.log('updater-service', 'AutoUpdater:update-available');

            isCheckingOrInstallingUpdates = true;
        });

        /** @listens AutoUpdater#on */
        autoUpdater.on('update-not-available', () => {
            logger.log('updater-service', 'AutoUpdater:update-not-available');

            isCheckingOrInstallingUpdates = false;
        });

        /** @listens AutoUpdater#on */
        autoUpdater.on('download-progress', (ev, progress) => {
            logger.log('updater-service', 'AutoUpdater:download-progress', JSON.stringify(progress));

            BrowserWindow.getAllWindows()[0].setProgressBar(progress.percent / 100);
        });

        /** @listens AutoUpdater#on */
        autoUpdater.on('progress', (ev, progress) => {
            logger.log('updater-service', 'AutoUpdater:progress', JSON.stringify(progress));

            BrowserWindow.getAllWindows()[0].setProgressBar(progress.percent / 100);
        });


        /** @listens AutoUpdater#on */
        autoUpdater.on('update-downloaded', () => {
            logger.log('updater-service', 'AutoUpdater:update-downloaded');

            isCheckingOrInstallingUpdates = true;

            messengerService.showQuestion(
                `Update successfully installed`,
                `${appProductName} has been updated successfully.${os.EOL}${os.EOL}` +
                `To apply the changes and complete the updating process, the app needs to be restarted.${os.EOL}${os.EOL}` +
                `Restart now?`, (response) => {
                    if (response === 0) {
                        BrowserWindow.getAllWindows().forEach((window) => { window.destroy(); });
                        autoUpdater.quitAndInstall();
                    }
                    if (response === 1) { return true; }

                    return true;
                });
        });

        /** @listens Electron.BrowserWindow#on */
        let mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
            mainWindow.on('show', () => {
                if (!isCheckingOrInstallingUpdates) {
                    autoUpdater.checkForUpdates();
                }
            });
        }

        autoUpdater.checkForUpdates();

        return autoUpdater;
    }
}


/**
 * Bump version in Settings file
 */
let bumpVersion = () => {
    logger.debug('updater-service', 'bumpInternalVersion()');

    let currentVersion = settings.getConfigurationItem('currentVersion').get();
    let wasUpdated = Boolean(semverCompare(packageJson.version, currentVersion) === 1);

    if (wasUpdated) {
        settings.getConfigurationItem('currentVersion').set(packageJson.version);
        messengerService.showInfo(`Update complete`, `${appProductName} has been updated to ${appVersion}.`);

        logger.log('updater-service', 'App:ready', 'wasUpdated', wasUpdated);
        logger.log('updater-service', 'App:ready', 'packageJson.version', packageJson.version);
        logger.log('updater-service', 'App:ready', 'currentVersion', currentVersion);
    }
};


/**
 * Initializer
 */
let init = () => {
    logger.debug('updater-service', 'create()');

    if (isDebug) { return; }

    try {
        updateManager = new UpdateManager();
    } catch (error) {
        logger.error('updater-service', error.message);
    }

    bumpVersion();
};

/**
 * Getter
 */
let get = () => {
    logger.debug('updater-service', 'get()');

    if (!updateManager) { return; }
    return updateManager;
};


/** @listens Electron.App#on */
app.on('ready', () => {
    logger.debug('updater-service', 'App:ready');

    init();
});


/**
 * @exports
 */
module.exports = get();
