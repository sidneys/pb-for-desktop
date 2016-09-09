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
const { app, BrowserWindow, ipcMain } = require('electron');

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
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const settings = require(path.join(appRootPath, 'app', 'scripts', 'configuration', 'settings'));
const appMenu = require(path.join(appRootPath, 'app', 'scripts', 'menus', 'app-menu'));
const trayMenu = require(path.join(appRootPath, 'app', 'scripts', 'menus', 'tray-menu'));
/* jshint ignore:start */
const mainWindow = require(path.join(appRootPath, 'app', 'scripts', 'components', 'main-window'));
const updaterService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'updater-service'));
/* jshint ignore:end */

/**
 * Squirrel Handler
 * @global
 */
if (electronSquirrelStartup) {
    (function() {
        return;
    })();
}

/**
 * @listens app#before-quit
 */
app.on('before-quit', () => {
    app.isQuitting = true;
});

/**
 * @listens app#quit
 */
app.on('quit', () => {
    logger.log('settings', `settingsFilePath: '${settings.settings.getSettingsFilePath()}'`);
    logger.debug('settings', util.inspect(settings.settings.getSync()));
});

 /**
 * @listens app#ready
 */
app.on('ready', () => {
    // DEBUG
    logger.debug('application', 'ready');
});


/**
 * @listens ipcMain:ipcEvent#log
 */
ipcMain.on('log', (event, message) => {
    logger.log(message);
});

/**
 * @listens ipcMain:ipcEvent#network
 */
ipcMain.on('network', (event, status) => {
    switch (status) {
        case 'online':
            trayMenu.setState('enabled');
            break;
        case 'offline':
            trayMenu.setState('disabled');
            break;
    }

    // DEBUG
    logger.debug('application', 'network', status);
});

