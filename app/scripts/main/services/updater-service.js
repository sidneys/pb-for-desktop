'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const os = require('os');
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { app, BrowserWindow } = electron || electron.remote;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
const semverCompare = require('semver-compare');
const { autoUpdater } = require('electron-updater');

/**
 * Modules
 * Internal
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-env'))('debug');
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const messengerService = require(path.join(appRootPath, 'app', 'scripts', 'main', 'services', 'messenger-service'));
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));
const notificationService = require(path.join(appRootPath, 'app', 'scripts', 'main', 'services', 'notification-service'));

/**
 * Application
 * @constant
 * @default
 */
const appProductName = packageJson.productName || packageJson.name;
const appVersion = packageJson.version;


/**
 * @instance
 */
let updaterService;

/**
 * Updater
 * @returns autoUpdater
 * @class
 */
class Updater {
    constructor() {
        if (platformHelper.isLinux) { return; }

        this.init();
    }

    init() {
        logger.debug('init');

        // Extend stateful
        autoUpdater.isUpdating = false;

        // Set Logger
        autoUpdater.logger = logger;

        /**
         * @listens AutoUpdater#error
         */
        autoUpdater.on('error', (error) => {
            logger.error('autoUpdater#error', error.message);

            autoUpdater.isUpdating = false;
        });

        /**
         * @listens AutoUpdater#checking-for-update
         */
        autoUpdater.on('checking-for-update', () => {
            logger.info('autoUpdater#checking-for-update');

            autoUpdater.isUpdating = true;
        });

        /**
         * @listens AutoUpdater#update-available
         */
        autoUpdater.on('update-available', (info) => {
            logger.info('autoUpdater#update-available', info);

            autoUpdater.isUpdating = true;

            notificationService.show(`Update available for ${appProductName}`, { body: `Version: ${info.version}` });
        });

        /**
         * @listens AutoUpdater#update-not-available
         */
        autoUpdater.on('update-not-available', (info) => {
            logger.info('autoUpdater#update-not-available', info);

            autoUpdater.isUpdating = false;
        });

        /**
         * @listens AutoUpdater#download-progress
         */
        autoUpdater.on('download-progress', (progress) => {
            logger.info('autoUpdater#download-progress', progress.percent);

            // Show update progress bar (Windows only)
            if (platformHelper.isWindows) {
                const win = BrowserWindow.getAllWindows()[0];
                if (!win) { return; }

                win.setProgressBar(progress.percent / 100);
            }
        });

        /**
         * @listens AutoUpdater#update-downloaded
         */
        autoUpdater.on('update-downloaded', (info) => {
            logger.info('autoUpdater#update-downloaded', info);

            autoUpdater.isUpdating = true;

            notificationService.show(`Update ready to install for ${appProductName}`, { body: `Version: ${info.version}` });

            if (Boolean(info.releaseNotes)) {
                configurationManager('releaseNotes').set(info.releaseNotes);
                logger.info('autoUpdater#update-downloaded', 'releaseNotes', info.releaseNotes);
            }

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

        autoUpdater.checkForUpdates();

        return autoUpdater;
    }
}


/**
 * Updates internal version to current version
 * @function
 */
let bumpInternalVersion = () => {
    logger.debug('bumpInternalVersion');

    let internalVersion = configurationManager('internalVersion').get();

    // DEBUG
    logger.debug('bumpInternalVersion', 'packageJson.version', packageJson.version);
    logger.debug('bumpInternalVersion', 'internalVersion', internalVersion);
    logger.debug('bumpInternalVersion', 'semverCompare(packageJson.version, internalVersion)', semverCompare(packageJson.version, internalVersion));

    // Initialize version
    if (!internalVersion) {
        configurationManager('internalVersion').set(packageJson.version);

        return;
    }

    // Compare internal/current version
    let wasUpdated = Boolean(semverCompare(packageJson.version, internalVersion) === 1);

    // DEBUG
    logger.debug('bumpInternalVersion', 'wasUpdated', wasUpdated);

    // Update internal version
    if (wasUpdated) {
        configurationManager('internalVersion').set(packageJson.version);

        const releaseNotes = configurationManager('releaseNotes').get();

        if (Boolean(releaseNotes)) {
            messengerService.showInfo(`${appProductName} has been updated to ${appVersion}.`, `Release Notes:${os.EOL}${os.EOL}${releaseNotes}`);
            logger.info(`${appProductName} has been updated to ${appVersion}.`, `Release Notes:${os.EOL}${os.EOL}${releaseNotes}`);
        } else {
            messengerService.showInfo(`Update complete`, `${appProductName} has been updated to ${appVersion}.`);
            logger.info(`Update complete`, `${appProductName} has been updated to ${appVersion}.`);
        }

        notificationService.show(`Update complete for ${appProductName}`, { body: `Version: ${appVersion}` });
    }
};


/**
 * Init
 */
let init = () => {
    logger.debug('init');

    // Only update if run from within purpose-built (signed) Electron binary
    if (process.defaultApp) { return; }

    updaterService = new Updater();

    bumpInternalVersion();
};


/**
 * @listens Electron.App#browser-window-focus
 */
app.on('browser-window-focus', () => {
    logger.debug('app#browser-window-focus');

    if (!updaterService) { return; }

    if (Boolean(updaterService.isUpdating) === false) {
        if (updaterService.checkForUpdates) {
            updaterService.checkForUpdates();
        }
    }
});

/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    init();
});