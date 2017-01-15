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
 * @param {String} message - Title
 * @param {Object} body - Content
 */
let showNotification = (message, body) => {
    let mainWindow = BrowserWindow.getAllWindows()[0];

    mainWindow.webContents.executeJavaScript(`new Notification('${message}', ${JSON.stringify(body)});`, true)
        .then((result) => {
            logger.debug('notification-service', 'complete', result);
        });
};


/**
 * @exports
 */
module.exports = {
    show: showNotification
};
