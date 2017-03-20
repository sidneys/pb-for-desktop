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
const { remote } = require('electron');

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path').path;
const fileUrl = require('file-url');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'managers', 'configuration-manager'));


/**
 * Notification
 * @constant
 * @default
 */
const notificationInterval = 2000;
const maxRecentNotifications = 5;

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
 * Configuration
 */
let lastNotification;
let soundVolume;


/**
 * Play Audio
 * @param {String} filePath - Path to WAV audio
 * @param {Function=} callback  - Callback
 *
 * @private
 */
let playSoundFile = function(filePath, callback) {
    logger.debug('playSoundFile');

    let cb = callback || function() {};
    let url = fileUrl(filePath);
    let AudioElement = new Audio(url);

    /**
     * @listens audio:MediaEvent#error
     */
    AudioElement.addEventListener('error', (err) => {
        return cb(err, url);
    });

    /**
     * @listens audio:MediaEvent#ended
     */
    AudioElement.addEventListener('ended', () => {
        return cb(null, url);
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
    logger.debug('getIconForPushbulletPush');

    const pb = window.pb;

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
    let deviceImage;
    let deviceId = push['source_device_iden'];
    let deviceList = pb.api.devices.all;

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
        logger.debug('init');

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

        // Trigger Notification
        let notification = new Notification(options.title, options);

        // Get soundEnabled lazy
        configurationManager.settings.get('soundEnabled').then(soundEnabled => {
            if (soundEnabled === true) {
                // Get soundFile lazy
                configurationManager.settings.get('soundFile').then(soundFile => {
                    // Show notification
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
    logger.debug('createPushbulletNotification');

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
    logger.debug('fetchRecentPushes');

    const pb = window.pb;

    let queueLimit = limit || 0;

    // Get hashmap of all pushes
    let pushesReference = pb.api.pushes.objs;
    let pushesList = [];

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
 * @param {Function=} callback - Callback
 * @returns {*}
 * @private
 */
let enqueuePushList = (pushesList, filterPushes, callback) => {
    logger.debug('enqueuePushList');

    let cb = callback || function() {};

    if (pushesList.length === 0) {
        return cb(pushesList.length);
    }

    let nextPushesList = pushesList;
    let notifyAfter = lastNotification || 0;

    // Remove pushes older than 'lastNotification' from array
    if (filterPushes) {
        nextPushesList = pushesList.filter((element) => {
            return (element.created) > notifyAfter;
        });
    }

    nextPushesList.forEach((push, pushIndex) => {
        let timeout = setTimeout(() => {

            // Show local notification
            createPushbulletNotification(push);

            // Update saved lastNotification
            if (push.created > notifyAfter) {
                lastNotification = push.modified;
                configurationManager.getItem('lastNotification').set(push.modified);
            }

            // Last push triggered
            if (nextPushesList.length === (pushIndex + 1)) {
                cb(nextPushesList.length);

                clearTimeout(timeout);
            }
        }, (parseInt(notificationInterval) * (pushIndex + 1)));
    });
};

/**
 * Enqueue 1 Push
 * @param {Object} push - Push Object
 * @param {Function=} callback - Callback
 * @public
 */
let enqueuePush = (push, callback) => {
    logger.debug('enqueuePush');

    let cb = callback || function() {};
    let pushesList = [push];

    enqueuePushList(pushesList, true, (length) => {
        cb(length);
    });
};

/**
 * Get all new pushes and show them (if any)
 * @param {Function=} callback - Callback
 * @public
 */
let enqueueRecentPushes = (callback) => {
    logger.debug('enqueueRecentPushes');

    let cb = callback || function() {};
    let pushesList = fetchRecentPushes(maxRecentNotifications);

    enqueuePushList(pushesList, false, (length) => {
        cb(length);
    });
};

/**
 * Init
 */
let init = () => {
    logger.debug('init');

    lastNotification = configurationManager.getItem('lastNotification').get();
    soundVolume = parseFloat(configurationManager.getItem('soundVolume').get());
};

/**
 * @listens window#load
 */
window.addEventListener('load', () => {
    logger.debug('window#load');

    init();
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
