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
 * @instance
 */
let lastNotification;
let soundVolume;


/**
 * Play Sound
 * @param {String} file - Path to WAV audio
 * @param {Function=} callback  - Callback
 *
 */
let playSound = function(file, callback) {
    logger.debug('playSound');

    let cb = callback || function() {};
    let url = fileUrl(file);
    let AudioElement = new Audio(url);

    AudioElement.volume = parseFloat(soundVolume);

    /**
     * @listens audio:MediaEvent#error
     */
    AudioElement.addEventListener('error', (err) => {
        return cb(err);
    });

    /**
     * @listens audio:MediaEvent#ended
     */
    AudioElement.addEventListener('ended', () => {
        return cb(null, url);
    });

    AudioElement.play();
};

/**
 * Find images for Pushbullet push
 * @param {Object} push - Push Object
 * @returns {String} Image URI
 *
 */
let createImageUrlForPushbulletPush = function(push) {
    logger.debug('createImageUrlForPushbulletPush');

    const pb = window.pb;

    const accountIdShort = push['receiver_iden'];
    const accountList = pb.api.accounts.all;

    let imageUrl;
    let accountImage;

    for (let account of accountList) {
        if (account['iden'].startsWith(accountIdShort)) {
            accountImage = account['image_url'];
        }
    }

    // Channels (IFTTT, Zapier ..)
    const channelId = push['client_iden'];
    const channelList = pb.api.grants.all;
    let channelImage;

    for (let channel of channelList) {
        if (channel['client']['iden'] === channelId) {
            channelImage = channel['client']['image_url'];
        }
    }

    // Devices (Phone, Tablet ..)
    const deviceId = push['source_device_iden'];
    const deviceList = pb.api.devices.all;
    let deviceImage;

    for (let device of deviceList) {
        if (device['iden'] === deviceId) {
            deviceImage = 'http://www.pushbullet.com/img/deviceicons/' + device['icon'] + '.png';
        }
    }

    // Mirroring
    let dataUrl;
    if (push['type'] === 'mirror') {
        dataUrl = `data:image/jpeg;base64${push.icon}`;
    }

    // Fallback
    imageUrl = dataUrl || channelImage || deviceImage || accountImage;

    return imageUrl;
};

/**
 * Dismiss Pushbullet push
 * @param {Object} push - Push Object
 *
 */
let dismissPushbulletPush = function(push) {
    logger.debug('dismissPushbulletPush');

    const pb = window.pb;

    // direction: self
    if (push.direction === 'self') {
        if (!push.dismissed && !push.target_device_iden) {
            logger.debug('dismissPushbulletPush', 'self', push.title);
            pb.api.pushes.dismiss(push);
        }
    }

    // direction: incoming
    if (push.direction === 'incoming') {
        if (!push.dismissed) {
            logger.debug('dismissPushbulletPush', 'incoming', push.title);
            pb.api.pushes.dismiss(push);
        }
    }
};

/**
 *  Decorator Pushbullet Push object
 * @function
 */
let decoratePushbulletPush = (push) => {
    push = _.defaults(push, pushDefaults);

    switch (push.type) {
        // Link
        case 'link':
            push.title = push.title;
            push.body = push.title;
            push.url = push['url'];
            push.icon = createImageUrlForPushbulletPush(push);
            break;
        // Note
        case 'note':
            push.title = push.title || push.body;
            push.body = push.body || push.title;
            push.icon = createImageUrlForPushbulletPush(push);
            break;
        // File
        case 'file':
            push.title = push.title || push.file_name;
            push.url = push.file_url;
            push.icon = push.image_url || createImageUrlForPushbulletPush(push);
            break;
        // Mirror
        case 'mirror':
            push.title = `${push.application_name}: push.title` || push.application_name;
            push.body = push.body || push.title;
            push.url = push.file_url;
            push.icon = push.image_url || createImageUrlForPushbulletPush(push);
            break;
    }

    // Detect URLs in title
    let detectedUrls = push.title.match(/\bhttps?:\/\/\S+/gi) || [];
    if (!push.url && detectedUrls.length > 0) {
        push.url = detectedUrls[0];
    }

    // Trim
    push.title = push.title.trim();
    push.body = push.body.trim();

    return push;
};

/**
 * Create HTML5 Notification using Pushbullet push object
 * @function
 */
let createNotification = (push) => {
        logger.debug('createNotification');

        push = decoratePushbulletPush(push);

        /**
         * Create HTML5 Notification
         */
        let notification = new Notification(push.title, {
            title: push.title,
            body: push.body,
            icon: push.icon,
            url: push.url,
            tag: push.iden,
            silent: true
        });

        /**
         * Play sound
         */
        configurationManager.settings.get('soundEnabled').then(soundEnabled => {
            if (soundEnabled === true) {
                configurationManager.settings.get('soundFile').then(soundFile => {
                    playSound(soundFile, function(err) {
                        if (err) {
                            logger.error('playSoundFile', err);
                        }
                    });
                });
            }
        });

        /**
         * @listens notification:PointerEvent#click
         */
        notification.addEventListener('click', () => {
            logger.debug('notification#click');

            // Open url
            if (push.url) { remote.shell.openExternal(push.url, { activate: false }, () => {}); }

            // Dismiss push
            dismissPushbulletPush(push);
        });
};

/**
 * Test if application is in 'Snooze' mode
 * @returns {Boolean|void}
 */
let isSnoozing = (Date.now() < remote.getGlobal('snoozeUntil'));

/**
 * Test if a notification should be shown for this push
 * @param {Object} push - Push Object
 * @returns {Boolean|void}
 */
let shouldShowPush = (push) => {
    logger.debug('shouldShowPush');

    // Don't show if push is not active (and was not mirrored)
    if (!push.active && (push.type !== 'mirror')) { return; }

    // Don't show if push was dismissed (and sent to 'self')
    if (push.dismissed && (push.direction === 'self')) { return; }

    return true;
};

/**
 * Show Pushbullet push
 * @param {Object} push - Push Object
 */
let showPush = (push) => {
    logger.debug('showPush');

    // Don't show if snooze mode
    if (!isSnoozing && shouldShowPush(push)) {
        createNotification(push);
    }

    // DEBUG
    // logger.info(util.inspect(push));
};

/**
 * Get all Pushbullet Pushes sorted by recency (ascending)
 * @param {Number..} limit - Limit result to fixed number
 * @returns {Array|undefined} List of Pushes
 */
let getRecentPushList = (limit) => {
    logger.debug('fetchRecentPushes');

    const pb = window.pb;
    const pushObjects = pb.api.pushes.objs;

    const queueLimit = limit || 0;

    let recentPushesList = [];

    // Build list of recent active pushes
    for (let pushIden in pushObjects) {
        if (pushObjects.hasOwnProperty(pushIden)) {
            if (shouldShowPush(pushObjects[pushIden])) {
                recentPushesList.push(pushObjects[pushIden]);
            }
        }
    }

    // Sort recent pushes by date created
    recentPushesList.sort(function(pushA, pushB) {
        let dateA = pushA.created;
        let dateB = pushB.created;

        if (dateA < dateB) {
            return -1;
        } else if (dateA > dateB) {
            return 1;
        }
        return 0;
    });

    // Apply size limit to recent pushes
    recentPushesList = recentPushesList.slice(recentPushesList.length - queueLimit, recentPushesList.length);

    return recentPushesList;
};

/**
 * Enqueue 1 + N Pushes
 * @param {Array} pushes - Pushbullet push objects
 * @param {Boolean} filter - Hide Pushes already shown
 * @param {Function=} callback - Callback
 * @returns {*}
 */
let enqueuePushList = (pushes, filter, callback) => {
    logger.debug('enqueuePushList');

    let cb = callback || function() {};

    if (pushes.length === 0) {
        return cb(pushes.length);
    }

    let nextPushesList = pushes;
    let notifyAfter = lastNotification || 0;

    // Remove pushes older than 'lastNotification' from array
    if (filter) {
        nextPushesList = pushes.filter((element) => {
            return (element.created) > notifyAfter;
        });
    }

    nextPushesList.forEach((push, pushIndex) => {
        let timeout = setTimeout(() => {

            // Show local notification
            showPush(push);

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
    let pushesList = getRecentPushList(maxRecentNotifications);

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
    enqueuePush: enqueuePush,
    enqueuePushList: enqueuePush,
    enqueueRecentPushes: enqueueRecentPushes,
    show: showPush
};
