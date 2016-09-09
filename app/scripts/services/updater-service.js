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
const semverRegex = require('semver-regex');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const messengerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'messenger-service'));

/**
 * Feed
 * @global
 */
const feedUrlBase = `updates-${packageJson.name}.herokuapp.com`;
const feedUrl = `https://${feedUrlBase}/update/${platformHelper.type}/${os.arch()}/${packageJson.version}`;
//const latestUrl = `https://${feedUrlBase}/download/latest/${platformHelper.type}/${os.arch()}`;

/**
 * @global
 */
let updateManager = {};
let isCheckingOrInstallingUpdates = false;

/**
 * UpdateManager
 * @class
 * @returns autoUpdater
 */
class UpdateManager {
    constructor() {
        if (platformHelper.isLinux) { return; }

        if (platformHelper.isMacOS) {
            electronAutoUpdater.setFeedURL(feedUrl);
        }

        logger.log('update-manager', `feedUrl: '${feedUrl}'`);

        /**
         * @listens electronAutoUpdater#showError
         */
        electronAutoUpdater.addListener('error', (error) => {
            logger.error('update-manager', error.message);

            isCheckingOrInstallingUpdates = false;
        });

        /**
         * @listens electronAutoUpdater#checking-for-update
         */
        electronAutoUpdater.addListener('checking-for-update', () => {
            logger.log('update-manager', 'checking-for-update');

            isCheckingOrInstallingUpdates = true;
        });

        /**
         * @listens electronAutoUpdater#update-available
         */
        electronAutoUpdater.addListener('update-available', () => {
            logger.log('update-manager', 'update-available');

            isCheckingOrInstallingUpdates = true;
        });

        /**
         * @listens electronAutoUpdater#update-not-available
         */
        electronAutoUpdater.addListener('update-not-available', () => {
            logger.log('update-manager', 'update-not-available');

            isCheckingOrInstallingUpdates = false;
        });

        /**
         * @listens electronAutoUpdater#update-downloaded
         */
        electronAutoUpdater.addListener('update-downloaded', (event, releaseNotes, releaseName, releaseDate, updateURL) => {
            logger.log('update-manager', 'update-downloaded');

            isCheckingOrInstallingUpdates = true;

            let releaseVersion = semverRegex().exec(updateURL)[0];
            messengerService.showQuestion(
                `Update successful (${releaseVersion})`,
                `${packageJson.productName} has been updated successfully.${os.EOL}${os.EOL}` +
                `To apply the changes and complete the updating process, the app needs to be restarted.${os.EOL}${os.EOL}` +
                `Restart now?`, (response) => {
                    if (response === 0) {
                        logger.log('update-manager', 'restarting');
                        BrowserWindow.getAllWindows().forEach((window) => {
                            window.destroy();
                        });
                        electronAutoUpdater.quitAndInstall();
                    }
                    if (response === 1) {
                        logger.log('update-manager', 'postponed');
                    }

                    return true;
                });

            // DEBUG
            logger.debug('update-manager', `updateURL: '${updateURL}'`, `releaseDate: '${releaseDate}'`);
            logger.debug('update-manager', `releaseVersion: '${releaseVersion}'`, `releaseName: '${releaseName}'`, `releaseNotes: '${releaseNotes}'`);
        });


        /**
         * @listens BrowserWindow:show
         */
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
 * @listens app#ready
 */
app.on('ready', () => {

    // Handle development
    if (isDebug) {
        return;
    }

    // Handle CLI
    try {
        updateManager = new UpdateManager();
    } catch (err) {
        logger.error('update-manager', err.message);
        return;
    }

    let currentVersion = electronSettings.getSync('internal.currentVersion');
    let wasUpdated = Boolean(semverCompare(packageJson.version, currentVersion) === 1);

    if (wasUpdated) {
        electronSettings.setSync('internal.currentVersion', packageJson.version);
        messengerService.showInfo(`Update complete`, `${packageJson.productName} has been updated to ${packageJson.version}.`);

        logger.log('update-manager', `wasUpdated: '${wasUpdated}'`);
        logger.log('update-manager', `packageJson.version: '${packageJson.version}'`, `currentVersion: '${currentVersion}'`);
    }


    // DEBUG
    logger.log('update-manager', 'ready');
});


/**
 * @exports
 */
module.exports = updateManager;
