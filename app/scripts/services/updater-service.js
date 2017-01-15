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
const electronSettings = require('electron-settings');
const electronAutoUpdater = require('electron-auto-updater').autoUpdater;
const semverCompare = require('semver-compare');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const messengerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'messenger-service'));


/**
 * App
 * @global
 * @constant
 */
const appProductName = packageJson.productName || packageJson.name;
const appVersion = packageJson.version;

/**
 * @global
 */
let updateManager = {};
let isCheckingOrInstallingUpdates = false;


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

        /** @listens AutoUpdater#on */
        electronAutoUpdater.on('error', (error) => {
            logger.error('updater-service', 'AutoUpdater:error', error.message);

            isCheckingOrInstallingUpdates = false;
        });

        /** @listens AutoUpdater#on */
        electronAutoUpdater.on('checking-for-update', () => {
            logger.debug('updater-service', 'AutoUpdater:checking-for-update');

            isCheckingOrInstallingUpdates = true;
        });

        /** @listens AutoUpdater#on */
        electronAutoUpdater.on('update-available', () => {
            logger.debug('updater-service', 'AutoUpdater:update-available');

            isCheckingOrInstallingUpdates = true;
        });

        /** @listens AutoUpdater#on */
        electronAutoUpdater.on('update-not-available', () => {
            logger.debug('updater-service', 'AutoUpdater:update-not-available');

            isCheckingOrInstallingUpdates = false;
        });

        /** @listens AutoUpdater#on */
        electronAutoUpdater.on('update-downloaded', () => {
            logger.debug('updater-service', 'AutoUpdater:update-downloaded');

            isCheckingOrInstallingUpdates = true;

            messengerService.showQuestion(
                `Update successfully installed`,
                `${appProductName} has been updated successfully.${os.EOL}${os.EOL}` +
                `To apply the changes and complete the updating process, the app needs to be restarted.${os.EOL}${os.EOL}` +
                `Restart now?`, (response) => {
                    if (response === 0) {
                        BrowserWindow.getAllWindows().forEach((window) => { window.destroy(); });
                        electronAutoUpdater.quitAndInstall();
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
                    electronAutoUpdater.checkForUpdates();
                }
            });
        }

        electronAutoUpdater.checkForUpdates();

        return electronAutoUpdater;
    }
}


/**
 * Bump version in Settings file
 */
let bumpInternalVersion = () => {
    logger.debug('updater-service', 'bumpInternalVersion()');

    let currentVersion = electronSettings.getSync('internal.currentVersion');
    let wasUpdated = Boolean(semverCompare(packageJson.version, currentVersion) === 1);

    if (wasUpdated) {
        electronSettings.setSync('internal.currentVersion', packageJson.version);
        messengerService.showInfo(`Update complete`, `${appProductName} has been updated to ${appVersion}.`);

        logger.debug('updater-service', 'App:ready', 'wasUpdated', wasUpdated);
        logger.debug('updater-service', 'App:ready', 'packageJson.version', packageJson.version);
        logger.debug('updater-service', 'App:ready', 'currentVersion', currentVersion);
    }
};


/** @listens Electron.App#on */
app.on('ready', () => {
    logger.debug('updater-service', 'App:ready');

    //if (isDebug) { return; }

    try {
        updateManager = new UpdateManager();
    } catch (error) {
        logger.error('updater-service', error.message);
    }

    bumpInternalVersion();
});


/**
 * @exports
 */
module.exports = updateManager;
