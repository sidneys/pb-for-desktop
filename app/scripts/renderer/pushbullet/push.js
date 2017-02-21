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
const { remote } = require('electron');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path').path;
const fileUrl = require('file-url');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const settings = require(path.join(appRootPath, 'app', 'scripts', 'configuration', 'settings'));


/**
 * @global
 * @constant
 */
const defaultInterval = 1000;


/**
 * @global
 */
let pb;

/**
 * Notification
 * @constant
 * @default
 */
const notificationInterval = 3000;
const maxRecentNotifications = 5;
const soundVolume = parseFloat(settings.getConfigurationItem('soundVolume').get());

/**
 * Notification Defaults
 * @constant
 * @default
 */
const pushDefaults = {
    push: {},
    type: 'note',
    title: null,
    body: null,
    url: null,
    icon: null
};

/**
 * Play Audio
 * @param {String} filePath - Path to WAV audio
 * @param {Function=} callback  - Callback
 *
 * @private
 */
let playSoundFile = function(filePath, callback) {
    logger.debug('push', 'playSoundFile()');

    let cb = callback || function() {};
    let soundFile = fileUrl(filePath);
    let AudioElement = new Audio(soundFile);

    /**
     * @listens audio:MediaEvent#error
     */
    AudioElement.addEventListener('error', (err) => {
        return cb(err, soundFile);
    });

    /**
     * @listens audio:MediaEvent#ended
     */
    AudioElement.addEventListener('ended', () => {
        return cb(null, soundFile);
    });

    AudioElement.volume = parseFloat(soundVolume);
    AudioElement.play();
};

/**
 * Find images for push properties
 * @param {Object} push - Pushbullet push (https://docs.pushbullet.com/#push)
 * @returns {String} Image URI
 *
 * @private
 */
let getIconForPushbulletPush = function(push) {
    logger.debug('push', 'getIconForPushbulletPush()');

    let imageUrl;

    // Accounts (Google, Facebook ..)
    let accountImage;
    let accountIdShort = push['receiver_iden'];
    let accountList = pb.api.accounts.all;

    for (let account of accountList) {
        if (account['iden'].startsWith(accountIdShort)) {
            accountImage = account['image_url'];
        }
    }

    // Channels (IFTTT, Zapier ..)
    let channelImage,
        channelId = push['client_iden'],
        channelList = pb.api.grants.all;

    for (let channel of channelList) {
        if (channel['client']['iden'] === channelId) {
            channelImage = channel['client']['image_url'];
        }
    }

    // Devices (Phone, Tablet ..)
    let deviceImage,
        deviceId = push['source_device_iden'],
        deviceList = pb.api.devices.all;

    for (let device of deviceList) {
        if (device['iden'] === deviceId) {
            deviceImage = 'http://www.pushbullet.com/img/deviceicons/' + device['icon'] + '.png';
        }
    }

    // Mirroring
    let dataUrl;
    if (push['type'] === 'mirror') {
        dataUrl = 'data:image/jpeg;base64,' + push.icon;
    }

    // Fallback
    imageUrl = dataUrl || channelImage || deviceImage || accountImage;

    return imageUrl;
};


/**
 * Pushbullet Notification Decorator
 * @class
 * @private
 */
class PushbulletNotification {
    constructor(pushTitle, pushObject) {
        this.init(pushTitle, pushObject);
    }

    init(pushTitle, pushObject) {
        logger.debug('push', 'init()');

        // Attributes https://docs.pushbullet.com/#push
        let push = pushObject || pushDefaults.push;
        let iden = push['iden'];
        let type = push['type'] || pushDefaults.type;
        let title = push['title'] || pushTitle || push['body'] || pushDefaults.title;
        let body = push['body'] || push['title'] || pushDefaults.body;
        let url = pushDefaults.url;
        let icon = getIconForPushbulletPush(push) || pushDefaults.ICON;


        switch (type) {
            // Link
            case 'link':
                title = title || push['url'];
                body = body || push['url'];
                url = push['url'];
                break;
            // Note
            case 'note':
                body = push['body'] || push['title'];
                break;
            // File
            case 'file':
                title = title || push['file_name'];
                url = push['file_url'];
                icon = push['image_url'] || icon;

                // Hide image mimetype
                if (push['file_type'].startsWith('image')) {
                    body = '';
                } else {
                    body = push['file_type'];
                }

                break;
            // Mirror
            case 'mirror':
                title = pushObject.application_name + ': ' + (pushObject.title || '');
                body = body || push['title'];
                url = push['file_url'];
                icon = push['image_url'] || icon;
                break;
        }

        // Urls found in the title override default url
        let titleUrlList = title.match(/\bhttps?:\/\/\S+/gi) || [];
        if (titleUrlList.length > 0) {
            url = titleUrlList[0];
        }

        // Tags Handling
        title = _.trim(title);
        body = _.trim(body);

        // Options for native notification
        let options = {
            title: title,
            body: body,
            icon: icon,
            url: url,
            tag: iden,
            silent: true
        };

        // Trigger native notification
        let notification = new Notification(options.title, options);

        settings.electronSettings.get('soundEnabled')
            .then(soundEnabled => {
                if (soundEnabled === true) {
                    settings.electronSettings.get('soundFile').then(soundFile => {
                            playSoundFile(soundFile, function(err, file) {
                                if (err) {
                                    logger.error('playSoundFile', file, err);
                                }
                            });
                        });
                }
            });

        /**
         * @listens notification:PointerEvent#click´
         */
        notification.addEventListener('click', () => {
            if (!url) { return; }
            remote.shell.openExternal(url);
        });
    }
}

/**
 * Create HTML5 Notification from Pushbullet Push
 * @param {Object} push - Pushbullet Push object
 * @returns {PushbulletNotification|void}
 * @private
 */
let createPushbulletNotification = (push) => {
    logger.debug('push', 'createPushbulletNotification()');

    // DEBUG
    // logger.debug('snoozed', isSnoozed);

    if (Date.now() < remote.getGlobal('snoozeUntil')) {
        return;
    }

    if ((push.active && push.active === true) || (push.type && push.type === 'mirror')) {
        return new PushbulletNotification(null, push);
    }
};

/**
 * Get all Pushbullet Pushes sorted by recency (ascending)
 * @param {Number..} limit - Limit result to fixed number
 * @returns {Array|undefined} List of Pushes
 * @private
 */
let fetchRecentPushes = (limit) => {
    logger.debug('push', 'fetchRecentPushes()');


    let queueLimit = limit || 0;

    // Get hashmap of all pushes
    let pushesReference = pb.api.pushes.objs,
        pushesList = [];

    // Build list of active pushes
    for (let iden in pushesReference) {
        let pushObject = pushesReference[iden];
        if (pushObject.active) {
            pushesList.push(pushObject);
        }
    }

    // Sort list pushes by creation date
    pushesList.sort(function(pushA, pushB) {
        let dateA = pushA.created;
        let dateB = pushB.created;

        if (dateA < dateB) {
            return -1;
        } else if (dateA > dateB) {
            return 1;
        }
        return 0;
    });

    // Apply size limit
    pushesList = pushesList.slice(pushesList.length - queueLimit, pushesList.length);

    return pushesList;
};

/**
 * Enqueue 1 + N Pushes
 * @param {Array} pushesList - Pushbullet push objects
 * @param {Boolean} filterPushes - Hide Pushes already shown
 * @param {Function} cb - Callback
 * @returns {*}
 * @private
 */
let enqueuePushList = (pushesList, filterPushes, cb) => {
    logger.debug('push', 'enqueuePushList()');

    let callback = cb || function() {};
    let self = this;

    if (pushesList.length === 0) {
        return callback(pushesList.length);
    }

    settings.electronSettings.get('lastNotification')
        .then(lastNotification => {

            let nextPushesList = pushesList;
            let notifyAfter = lastNotification || 0;

            // Remove pushes older than 'lastNotification' from array
            if (filterPushes) {
                nextPushesList = pushesList.filter(function(element) {
                    return (element.created) > notifyAfter;
                });
            }

            nextPushesList.forEach(function(push, pushIndex) {
                let notificationTimeout = setTimeout(function() {

                    // Show local notification
                    createPushbulletNotification(push);

                    if (push.created > notifyAfter) {
                        // Update 'lastNotification' with timestamp from most recent push
                        settings.getConfigurationItem('lastNotification').set(push.modified);
                    }

                    // Callback
                    if (nextPushesList.length === (pushIndex + 1)) {
                        callback(nextPushesList.length);
                        clearTimeout(notificationTimeout);
                    }
                }, (parseInt(notificationInterval) * (pushIndex + 1)), self);
            }, self);
        });
};

/**
 * Enqueue 1 Push
 * @param {Object} push - Push Object
 * @param {Function=} cb - Callback
 * @public
 */
let enqueuePush = (push, cb) => {
    logger.debug('push', 'enqueuePush()');

    let callback = cb || function() {};
    let pushesList = [push];

    enqueuePushList(pushesList, true, function(length) {
        callback(length);
    });
};

/**
 * Get all new pushes and show them (if any)
 * @param {Function=} cb - Callback
 * @public
 */
let enqueueRecentPushes = (cb) => {
    logger.debug('push', 'enqueueRecentPushes()');

    let callback = cb || function() {};
    let pushesList = fetchRecentPushes(maxRecentNotifications);

    enqueuePushList(pushesList, false, function(length) {
        callback(length);
    });
};


/** @listens window:#load */
window.addEventListener('load', () => {
    logger.debug('push', 'window:load');

    let pollingInterval = setInterval(function() {
        if (!window.pb || !window.pb.account) { return; }

        pb = window.pb;

        clearInterval(pollingInterval);
    }, defaultInterval, this);
});


/**
 * @exports
 */
module.exports = {
    create: createPushbulletNotification,
    enqueuePush: enqueuePush,
    enqueueRecentPushes: enqueueRecentPushes,
    enqueuePushList: enqueuePush
};
