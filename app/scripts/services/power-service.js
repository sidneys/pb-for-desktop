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
const { app, BrowserWindow, webContents } = electron;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });


/**
 * Reload all windows
 * @function
 *
 * @private
 */
let reloadWindows = () => {
    logger.debug('reloadWindows');

    const winList = BrowserWindow.getAllWindows();

    winList.forEach((win) => {
        logger.debug('reloadWindows', 'reloaded', win.getTitle());

        win.reload();
    })
};


/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    /**
     * @listens Electron.powerMonitor#suspend
     */
    electron.powerMonitor.on('suspend', () => {
        logger.log('webview#suspend');
    });

    /**
     * @listens Electron.powerMonitor#resume
     */
    electron.powerMonitor.on('resume', () => {
        logger.log('webview#resume');

        reloadWindows();
    });
});
