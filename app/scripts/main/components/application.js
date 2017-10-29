'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const EventEmitter = require('events');
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
const appRootPath = require('app-root-path');
const logger = require('@sidneys/logger')({ write: true });

/**
 * Modules
 * Configuration
 */
EventEmitter.defaultMaxListeners = Infinity;
appRootPath.setPath(path.join(__dirname, '..', '..', '..', '..'));


/**
 * App
 * Configuration
 */
app.disableHardwareAcceleration();


/**
 * Modules
 * Internal
 * @constant
 */
/* eslint-disable no-unused-vars */
const globals = require(path.join(appRootPath['path'], 'app', 'scripts', 'main', 'components', 'globals'));
const appMenu = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'menus', 'app-menu'));
const mainWindow = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'windows', 'main-window'));
const configurationManager = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));
const trayMenu = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'menus', 'tray-menu'));
const updaterService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'updater-service'));
const powerService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'power-service'));
const debugService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'debug-service'));
const snoozerService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'snoozer-service'));
/* eslint-enable */


/**
 * @listens Electron.App#before-quit
 */
app.on('before-quit', () => {
    logger.debug('app#before-quit');

    global.state.isQuitting = true;
});

/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready');
});

/**
 * Ensure single instance
 */
const isSecondInstance = app.makeSingleInstance(() => {
    logger.debug('isSecondInstance', 'primary instance');

    logger.warn('Multiple application instances detected', app.getPath('exe'));
    logger.warn('Multiple application instances detected', 'Restoring primary application instance');

    BrowserWindow.getAllWindows().forEach((browserWindow) => {
        browserWindow.restore();
        app.focus();
    });
});

if (isSecondInstance) {
    logger.debug('isSecondInstance', 'secondary instance');

    logger.warn('Multiple application instances detected', app.getPath('exe'));
    logger.warn('Multiple application instances detected', 'Shutting down secondary application instances');

    process.exit(0);
}
