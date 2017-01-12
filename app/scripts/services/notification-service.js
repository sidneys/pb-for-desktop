'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const path = require('path');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const { BrowserWindow } = require('electron');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });


/**
 * Show Internal Notification
 * @param {String} message - Content
 */
let showNotification = (message) => {
    let mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.executeJavaScript(`new Notification('${message}', { icon: '../../images/icon-text.png', body: '${message}',  silent: true });`, true)
        .then((result) => {
            // DEBUG
            logger.debug('notification-service', 'result', result);
        });

    // DEBUG
    logger.debug('notification-service', 'show', message);
};


/**
 * @exports
 */
module.exports = {
    show: showNotification
};
