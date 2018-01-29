'use strict';


/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { nativeImage, Notification } = electron;

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const logger = require('@sidneys/logger')({ write: true });


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
 * @return {Electron.Notification} - Notification
 */
let create = (options) => {
    logger.debug('create');

    // Accept simple strings as payload
    if (!_.isPlainObject(options)) {
        options = {
            title: options
        };
    }

    // Convert icon string filepath to Electron nativeImage
    if (options.icon && _.isString(options.icon)) {
        options.icon = nativeImage.createFromPath(options.icon);
    }

    const notificationOptions = _.defaultsDeep(options, defaultOptions);

    return new Notification(notificationOptions);
};


/**
 * @exports
 */
module.exports = {
    create: create
};
