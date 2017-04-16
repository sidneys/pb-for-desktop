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
const { webContents } = electron || electron.remote;

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path')['path'];

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * Application
 * @constant
 * @default
 */
const appIcon = path.join(appRootPath, 'icons', platformHelper.type, `icon${platformHelper.iconImageExtension(platformHelper.type)}`);
const appProductName = packageJson.productName || packageJson.name;


/**
 * Default HTML5 notification options
 * @constant
 * @default
 */
const defaultOptions = {
    silent: true
};

/**
 * Show Notification
 * @param {String=} title - Title
 * @param {Object=} options - Title
 * @function
 *
 * @public
 */
let showNotification = (title, options) => {
    logger.debug('showNotification');

    if (!_.isString(title)) { return; }

    const notificationTitle = _.trim(title);
    const notificationOptions = JSON.stringify(_.defaultsDeep(options, defaultOptions));

    const code = `new Notification('${notificationTitle}', ${notificationOptions});`;

    if (webContents.getAllWebContents().length === 0) {
        logger.warn('could not show notification', 'no webcontents available');
        return;
    }

    webContents.getAllWebContents()[0].executeJavaScript(code, true);
};


/**
 * @exports
 */
module.exports = {
    show: showNotification
};
