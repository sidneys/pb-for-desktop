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
const { app } = electron;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path');

/**
 * Modules
 * Configuration
 */
EventEmitter.defaultMaxListeners = Infinity;
appRootPath.setPath(path.join(__dirname, '..', '..', '..', '..'));

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath.path, 'lib', 'logger'))({ write: true });
const appMenu = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'menus', 'app-menu')); // jshint ignore:line
const mainWindow = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'windows', 'main-window')); // jshint ignore:line
const configurationManager = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'managers', 'configuration-manager')); // jshint ignore:line
const trayMenu = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'menus', 'tray-menu')); // jshint ignore:line
const updaterService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'updater-service')); // jshint ignore:line
const powerService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'power-service')); // jshint ignore:line
const debugService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'debug-service')); // jshint ignore:line
//const globalIpcService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'global-ipc-service')); // jshint ignore:line


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
app.once('ready', () => {
    logger.debug('app#ready');
});
