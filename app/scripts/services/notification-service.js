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
 * @const
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * App
 * @global
 * @constant
 */
const appIcon = path.join(appRootPath, 'icons', platformHelper.type, `icon${platformHelper.iconImageExtension(platformHelper.type)}`);
const appProductName = packageJson.productName || packageJson.name;


/**
 * Show Internal Notification
 * @param {String} message - Title
 */
let showNotification = (message) => {
    let options = {
        body: message,
        icon: appIcon,
        silent: true
    };

    BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`new Notification('${appProductName}', ${JSON.stringify(options)});`, true).then(() => {});
};


/**
 * @exports
 */
module.exports = {
    show: showNotification
};
