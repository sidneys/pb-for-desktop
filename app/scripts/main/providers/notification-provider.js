'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const os = require('os');
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { Notification } = electron;

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
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * Application
 * @constant
 * @default
 */
const appName = global.manifest.name;

/**
 * Notification defaults
 * @constant
 * @default
 */
const defaultOptions = {
    hasReply: false,
    silent: true
};


/**
 * Create
 * @param {Object|String|Number} options - Notification Options
 * @return {Electron.Notification|ToastNotification} - Native Notification
 */
let create = (options) => {
    logger.debug('create');

    // Support Strings / Numbers
    if (!_.isPlainObject(options)) {
        options = {
            title: options
        };
    }

    const notificationOptions = _.defaultsDeep(options, defaultOptions);

    let notification;

    notification = new Notification(notificationOptions);

    return notification;
};


/**
 * @exports
 */
module.exports = {
    create: create
};
