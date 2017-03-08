'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { app } = electron;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path').path;
const electronSquirrelStartup = require('electron-squirrel-startup');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const appMenu = require(path.join(appRootPath, 'app', 'scripts', 'menus', 'app-menu')); // jshint ignore:line
const mainWindow = require(path.join(appRootPath, 'app', 'scripts', 'windows', 'main-window')); // jshint ignore:line
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'managers', 'configuration-manager')); // jshint ignore:line
const trayMenu = require(path.join(appRootPath, 'app', 'scripts', 'menus', 'tray-menu')); // jshint ignore:line
const updaterService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'updater-service')); // jshint ignore:line
const powerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'power-service')); // jshint ignore:line


/**
 * Auto-Update Handler
 */
if (electronSquirrelStartup) {
    app.quit();
}

/**
 * Disable GPU
 */
app.disableHardwareAcceleration();


/**
 * @listens Electron.App#before-quit
 */
app.on('before-quit', () => {
    logger.debug('app#before-quit');

    app.isQuitting = true;
});

/**
 * @listens Electron.App#ready
 */
app.on('ready', () => {
    logger.debug('app#ready');
});