'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const path = require('path');
const util = require('util');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const { app } = require('electron');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;
const electronSquirrelStartup = require('electron-squirrel-startup');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const appMenu = require(path.join(appRootPath, 'app', 'scripts', 'menus', 'app-menu')); // jshint ignore:line
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const mainWindow = require(path.join(appRootPath, 'app', 'scripts', 'windows', 'main-window')); // jshint ignore:line
const settings = require(path.join(appRootPath, 'app', 'scripts', 'configuration', 'settings'));
const trayMenu = require(path.join(appRootPath, 'app', 'scripts', 'menus', 'tray-menu')); // jshint ignore:line
const updaterService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'updater-service')); // jshint ignore:line


/**
 * Squirrel Handler
 * @global
 */
if (electronSquirrelStartup) {
    app.quit();
}

/**
 * Disable GPU
 * @global
 */
app.disableHardwareAcceleration();


/** @listens Electron.App#before-quit */
app.on('before-quit', () => {
    logger.debug('application', 'App:before-quit');

    app.isQuitting = true;
});

/** @listens Electron.App#quit */
app.on('quit', () => {
    logger.debug('application', 'App:quit');

    logger.debug('application', 'settings', `settingsFilePath: '${settings.electronSettings.getSettingsFilePath()}'`);
    logger.debug('application', 'settings', util.inspect(settings.electronSettings.getSync()));
});

/** @listens Electron.App#on */
app.on('ready', () => {
    logger.debug('application', 'App:ready');
});
