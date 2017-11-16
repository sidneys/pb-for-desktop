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
const { app, BrowserWindow } = electron;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
const removeMarkdown = require('remove-markdown');
const semverCompare = require('semver-compare');
const logger = require('@sidneys/logger')({ write: true });
const platformTools = require('@sidneys/platform-tools');
const { autoUpdater } = require('electron-updater');

/**
 * Modules
 * Internal
 * @constant
 */
const dialogProvider = require(path.join(appRootPath, 'app', 'scripts', 'main', 'providers', 'dialog-provider'));
const notificationProvider = require(path.join(appRootPath, 'app', 'scripts', 'main', 'providers', 'notification-provider'));
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));

/**
 * Application
 * @constant
 * @default
 */
const appProductName = global.manifest.productName;
const appCurrentVersion = global.manifest.version;


/**
 * Get mainWindow
 * @return {Electron.BrowserWindow}
 */
let getMainWindow = () => global.mainWindow;


/**
 * Retrieve appAutoUpdate
 * @return {Boolean} - Yes / no
 */
let retrieveAppAutoUpdate = () => configurationManager('appAutoUpdate').get();

/**
 * Retrieve appChangelog
 * @return {String} - changelog
 */
let retrieveAppChangelog = () => configurationManager('appChangelog').get();

/**
 * Store appChangelog
 * @param {String} changelog - Changelog
 * @return {void}
 */
let storeAppChangelog = (changelog) => configurationManager('appChangelog').set(changelog);

/**
 * Retrieve appLastVersion
 * @return {String} - Version
 */
let retrieveAppLastVersion = () => configurationManager('appLastVersion').get();

/**
 * Store appLastVersion
 * @param {String} version - Version
 * @return {void}
 */
let storeAppLastVersion = (version) => configurationManager('appLastVersion').set(version);


/**
 * @class UpdaterService
 * @property {AppUpdater} autoUpdater - Auto updater instance
 * @property {Boolean} isUpdating - App is currently updating
 */
class UpdaterService {
    /**
     * @constructor
     */
    constructor() {
        logger.debug('constructor');

        // Do not run with debug Electron application
        if (process.defaultApp) { return; }

        // Do not run on Linux
        if (platformTools.isLinux) { return; }

        this.autoUpdater = autoUpdater;
        this.isUpdating = false;

        this.init();
    }

    /**
     * Init
     */
    init() {
        logger.debug('init');

        this.bumpAppLastVersion();
        this.registerAutoUpdater();
    }

    /**
     * Register Electron.AutoUpdater Singleton
     */
    registerAutoUpdater() {
        logger.debug('registerAutoUpdater');

        /**
         * Add Logger
         */
        this.autoUpdater.logger = logger;

        /**
         * @listens Electron.AutoUpdater#error
         */
        this.autoUpdater.on('error', (error) => {
            logger.error('autoUpdater#error', error.message);

            this.isUpdating = false;
        });

        /**
         * @listens Electron.AutoUpdater#checking-for-update
         */
        this.autoUpdater.on('checking-for-update', () => {
            logger.debug('UpdaterService#checking-for-update');

            this.isUpdating = true;
        });

        /**
         * @listens Electron.AutoUpdater#update-available
         */
        this.autoUpdater.on('update-available', (info) => {
            logger.debug('UpdaterService#update-available', info);

            this.isUpdating = true;

            const notification = notificationProvider.create({ title: `Update available for ${appProductName}`, subtitle: info.version });
            notification.show();
        });

        /**
         * @listens Electron.AutoUpdater#update-not-available
         */
        this.autoUpdater.on('update-not-available', (info) => {
            logger.debug('UpdaterService#update-not-available', info);

            this.isUpdating = false;
        });

        /**
         * @listens Electron.AutoUpdater#download-progress
         */
        this.autoUpdater.on('download-progress', (progress) => {
            logger.debug('UpdaterService#download-progress');

            logger.info('application update', 'progress', `${progress['percent'].toFixed(2)}%`);

            /**
             * Show update progress (Windows)
             */
            if (platformTools.isWindows) {
                const mainWindow = getMainWindow();
                if (!mainWindow) { return; }

                mainWindow.setProgressBar(progress['percent'] / 100);
            }
        });

        /**
         * @listens Electron.AutoUpdater#update-downloaded
         */
        this.autoUpdater.on('update-downloaded', (info) => {
            logger.info('UpdaterService#update-downloaded', info);

            this.isUpdating = true;

            const notification = notificationProvider.create({ title: `Update ready to install for ${appProductName}`, subtitle: info.version });
            notification.show();

            if (!!info.releaseNotes) {
                const releaseNotesPlaintext = removeMarkdown(info.releaseNotes);

                logger.info('UpdaterService#update-downloaded', 'releaseNotesPlaintext', releaseNotesPlaintext);

                storeAppChangelog(releaseNotesPlaintext);
            }

            dialogProvider.question(
                `Update successfully installed`,
                `${appProductName} has been updated successfully.${os.EOL}${os.EOL}` +
                `To apply the changes and complete the updating process, the app needs to be restarted.${os.EOL}${os.EOL}` +
                `Restart now?`, (response) => {
                    if (response === 0) {
                        BrowserWindow.getAllWindows().forEach((browserWindow) => browserWindow.destroy());
                        this.autoUpdater.quitAndInstall();
                    }
                    if (response === 1) { return true; }

                    return true;
                });
        });

        this.checkForUpdates();
    }

    /**
     * Bump last app version
     * @static
     */
    bumpAppLastVersion() {
        const appLastVersion = retrieveAppLastVersion();

        // Initialize version
        if (!appLastVersion) {
            storeAppLastVersion(appCurrentVersion);

            return;
        }

        // Compare internal/current version
        let wasUpdated = Boolean(semverCompare(appCurrentVersion, appLastVersion) === 1);

        // Update internal version
        if (wasUpdated) {
            storeAppLastVersion(appCurrentVersion);

            const changelogPlaintext = retrieveAppChangelog();

            logger.debug('bumpAppLastVersion', 'changelogPlaintext', changelogPlaintext);

            if (!!changelogPlaintext) {
                dialogProvider.info(`${appProductName} has been updated to ${appCurrentVersion}`, changelogPlaintext);
            } else {
                dialogProvider.info(`${appProductName} has been updated to ${appCurrentVersion}`, `Update completed successfully.`);
            }

            const notification = notificationProvider.create({ title: `Update installed for ${appProductName}`, subtitle: appCurrentVersion });
            notification.show();
        }
    }

    /**
     * Check if updater is ready
     * @return {Boolean} - Yes / no
     */
    isAvailable() {
        logger.debug('isAvailable');

        return Boolean(this.autoUpdater);
    }

    /**
     * Check if currently updating
     * @return {Boolean} - Yes / no
     */
    isActive() {
        logger.debug('isActive');

        return Boolean(this.isUpdating);
    }

    /**
     * Check for updates
     */
    checkForUpdates() {
        logger.debug('checkForUpdates');

        if (!this.isAvailable()) { return; }
        if (this.isActive()) { return; }

        if (!retrieveAppAutoUpdate()) { return; }

        this.autoUpdater.checkForUpdates();
    }
}


/**
 * Init
 */
let init = () => {
    logger.debug('init');

    // Ensure single instance
    if (!global.updaterService) {
        global.updaterService = new UpdaterService();
    }
};


/**
 * @listens Electron.App#browser-window-focus
 */
app.on('browser-window-focus', () => {
    logger.debug('app#browser-window-focus');

    if (!global.updaterService) { return; }

    global.updaterService.checkForUpdates();
});

/**
 * @listens Electron.App#Event:ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    init();
});


/**
 * @exports
 */
module.exports = global.updaterService;
