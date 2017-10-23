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
const { remote } = electron;
// const { nativeImage } = electron;

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path')['path'];
const fileUrl = require('file-url');
const moment = require('moment');
const getYouTubeID = require('get-youtube-id');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const configurationManager = remote.require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));
const notificationProvider = remote.require(path.join(appRootPath, 'app', 'scripts', 'main', 'providers', 'notification-provider'));
const pbSms = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'sms'));

/** @namespace Audio */
/** @namespace pb.api.accounts */
/** @namespace pb.api.grants */
/** @namespace pb.api.pushes */
/** @namespace pb.api.pushes.dismiss */
/** @namespace pb.sms */
/** @namespace push.application_name */
/** @namespace push.dismissed */
/** @namespace push.file_name */
/** @namespace push.file_url */
/** @namespace push.image_url */
/** @namespace push.notifications */


/**
 * Notification
 * @constant
 * @default
 */
const notificationInterval = 2000;
const maxRecentNotifications = 5;


/**
 * Retrieve PushbulletLastNotificationTimestamp
 * @return {Number} - timestamp
 */
let retrievePushbulletLastNotificationTimestamp = () => configurationManager('pushbulletLastNotificationTimestamp').get();

/**
 * Store PushbulletLastNotificationTimestamp
 * @param {Number} timestamp - Timestamp
 * @return {void}
 */
let storePushbulletLastNotificationTimestamp = (timestamp) => configurationManager('pushbulletLastNotificationTimestamp').set(timestamp);

/**
 * Retrieve ShowAppBadgeCount
 * @return {Boolean} - Show
 */
let retrieveAppShowBadgeCount = () => configurationManager('appShowBadgeCount').get();

/**
 * Retrieve PushbulletHideNotificationBody
 * @return {Boolean} - Hide
 */
let retrievePushbulletHideNotificationBody = () => configurationManager('pushbulletHideNotificationBody').get();

/**
 * Retrieve PushbulletSoundEnabled
 * @return {Boolean} - Enabled
 */
let retrievePushbulletSoundEnabled = () => configurationManager('pushbulletSoundEnabled').get();

/**
 * Retrieve PushbulletSmsEnabled
 * @return {Boolean} - Enabled
 */
let retrievePushbulletSmsEnabled = () => configurationManager('pushbulletSmsEnabled').get();

/**
 * Retrieve PushbulletSoundFile
 * @return {String} - Path
 */
let retrievePushbulletSoundFile = () => configurationManager('pushbulletSoundFile').get();

/**
 * Retrieve AppSoundVolume
 * @return {Number} - Volume
 */
let retrievePushbulletSoundVolume = () => configurationManager('pushbulletSoundVolume').get();


/**
 * @instance
 */
let lastNotificationTimestamp;
let appSoundVolume;

/**
 * Set application badge count
 * @param {Number} total - Number to set
 *
 */
let updateBadge = (total) => {
    logger.debug('updateBadge');

    if (Boolean(retrieveAppShowBadgeCount()) === false) { return; }

    remote.app.setBadgeCount(total);
};

/**
 * Play Sound
 * @param {String} file - Path to WAV audio
 * @param {Function=} callback  - Callback
 *
 */
let playSound = (file, callback = () => {}) => {
    logger.debug('playSound');

    let url = fileUrl(file);
    let AudioElement = new Audio(url);

    AudioElement.volume = appSoundVolume;

    /**
     * @listens audio:MediaEvent#error
     */
    AudioElement.addEventListener('error', (err) => {
        return callback(err);
    });

    /**
     * @listens audio:MediaEvent#ended
     */
    AudioElement.addEventListener('ended', () => {
        callback(null, url);
    });

    AudioElement.play().then(() => {
        logger.debug('playSound', 'complete');
    });
};

/**
 * Find images for Pushbullet push
 * @param {Object} push - Push Object
 * @returns {String} Image URI
 */
let generateImageUrl = (push) => {
    logger.debug('generateImageUrl');

    const pb = window.pb;

    let iconUrl;

    /**
     * Account icon
     */
    let iconAccount;
    const accountIdShort = push['receiver_iden'];

    for (let account of pb.api.accounts.all) {
        if (account['iden'].startsWith(accountIdShort)) {
            iconAccount = account['image_url'];
        }
    }

    /**
     * Channel icon
     */
    let iconChannel;
    const channelId = push['client_iden'];

    for (let channel of pb.api.grants.all) {
        if (channel['client']['iden'] === channelId) {
            iconChannel = channel['client']['image_url'];
        }
    }

    /**
     * Device icon
     */
    let iconDevice;
    const deviceId = push['source_device_iden'];

    for (let device of pb.api.devices.all) {
        if (device['iden'] === deviceId) {
            iconDevice = `http://www.pushbullet.com/img/deviceicons/${device.icon}.png`;
        }
    }

    /**
     * SMS icon
     */
    if (push['type'] === 'sms_changed') {
        iconDevice = 'http://www.pushbullet.com/img/deviceicons/phone.png';
    }

    /**
     * Mirror icon
     */
    let iconMirror;

    if (push['type'] === 'mirror') {
        iconMirror = `data:image/jpeg;base64,${push.icon}`;
    }

    /**
     * Website icon
     */
    let iconWebsite;

    if (push['type'] === 'link') {
        // YouTube
        if (getYouTubeID(push['url'])) {
            iconWebsite = `https://img.youtube.com/vi/${getYouTubeID(push['url'])}/hqdefault.jpg`;
        } else {
            iconWebsite = `https://icons.better-idea.org/icon?size=128&url=${push['url']}`;
        }
    }

    // Fallback
    iconUrl = iconWebsite || iconMirror || iconChannel || iconDevice || iconAccount;

    return iconUrl;
};

/**
 * Dismiss Pushbullet push
 * @param {Object} push - Push Object
 *
 */
let dismissPushbulletPush = (push) => {
    logger.debug('dismissPushbulletPush');

    const pb = window.pb;

    // direction: self
    if (push.direction === 'self') {
        if (!push.dismissed && !push.target_device_iden) {
            logger.debug('dismissPushbulletPush', 'self', 'push.title:', push.title);
            pb.api.pushes.dismiss(push);
        }
    }

    // direction: incoming
    if (push.direction === 'incoming') {
        if (!push.dismissed) {
            logger.debug('dismissPushbulletPush', 'incoming', 'push.title:', push.title);
            pb.api.pushes.dismiss(push);
        }
    }
};

/**
 * Parse strings, look for strings in tags (see https://goo.gl/ijKFPd)
 * @see https://goo.gl/ijKFPd
 * @param {String} message - Message String
 * @returns {Object} - Message Object
 */
let parsePush = (message) => {
    logger.debug('parsePush', message);

    // default
    let body = message;
    let subtitle = message;
    let title = message;

    // characters for tag detection
    const tagStart = '[';
    const tagEnd = ']';


    let tagList = title.match(new RegExp(`\\${tagStart}(.*?)\\${tagEnd}`, 'gi')) || [];
    let titleList = title.match(new RegExp(`${tagStart}^${tagStart}\\${tagEnd}${tagEnd}+(?=${tagEnd})`, 'gi')) || [];

    if (titleList.length > 0) {
        /** body */
        // remove all tags
        tagList.forEach((tag) => { body = body.replace(tag, ''); });

        /** title */
        if (titleList.length > 1) {
            subtitle = _.startCase(_.toLower(titleList[0]));

            titleList.shift();
            title = titleList.join(` | `);
        }
    }

    return {
        body: body,
        subtitle: subtitle,
        title: title
    };
};

/**
 * Decorate Push objects
 * @param {Object} push - Push Object
 * @returns {Object} - Push Object
 */
let decoratePushbulletPush = (push) => {
    logger.debug('decoratePushbulletPush', push.type);
    //logger.debug('decoratePushbulletPush', 'undecorated:', push);

    switch (push.type) {
        // Link
        case 'link':
            push.url = push['url'];
            push.icon = generateImageUrl(push);

            if (!push.body && !push.title) {
                push.title = push.url;
            }

            if (!push.body && push.title) {
                let parsed = parsePush(push.title);

                push.body = parsed.body;
                push.subtitle = parsed.subtitle;
                push.title = parsed.title;
            }

            break;
        // Note
        case 'note':
            push.title = push.title || push.body;
            push.body = push.body || push.title;
            push.icon = generateImageUrl(push);
            //push.title = `Note | ${push.title}`;

            break;
        // File
        case 'file':
            push.title = push.title || push.file_name;
            push.body = push.body || push.title;
            push.url = push.file_url;
            push.icon = push.image_url || generateImageUrl(push);
            //push.title = `File | ${push.title}`;

            break;
        // Mirror
        case 'mirror':
            if (push.application_name && push.title) {
                push.title = `${push.application_name} | ${push.title}`;
            } else if (push.application_name && !push.title) {
                push.title = push.application_name;
            }

            push.body = push.body || push.title;
            push.url = push.file_url;
            push.icon = push.image_url || generateImageUrl(push);

            break;
        // SMS
        case 'sms_changed':
            if (push.notifications.length !== 0) {
                let sms = push.notifications[0];
                let phonenumber = sms.title;
                let text = sms.body;
                let time = (new Date(0)).setUTCSeconds(sms.timestamp);

                push.title = `SMS | ${phonenumber}`;
                push.body = `${text}${os.EOL}${moment(time).fromNow()}`;
                push.icon = push.image_url || generateImageUrl(push);
            }
            break;
    }

    // Detect URLs in title
    let detectedUrl = (push.title && push.title.match(/\bhttps?:\/\/\S+/gi)) || [];
    if (!push.url && detectedUrl.length > 0) {
        push.url = detectedUrl[0];
    }

    // Trim
    push.title = push.title && push.title.trim();
    push.body = push.body && push.body.trim();

    //logger.debug('decoratePushbulletPush', 'decorated:', push);

    return push;
};

/**
 * Create Notification from Push Objects
 * @param {Object} push - Push Object
 */
let createNotification = (push) => {
    logger.debug('createNotification');

    /**
     * Decorate Push object
     */
    push = decoratePushbulletPush(push);

    /**
     * Read Settings
     */

    /**
     * Create Options
     */
    const options = {
        body: push.body,
        icon: push.icon,
        subtitle: push.subtitle,
        tag: push.iden,
        title: push.title,
        url: push.url
    };

    /**
     * Body
     */
    const hideNotificationBody = retrievePushbulletHideNotificationBody();
    if (hideNotificationBody) {
        options.body = void 0;
    }

    /**
     * Body
     */
    if (push.type === 'sms_changed') {
        options.hasReply = true;
        options.replyPlaceholder = 'Your SMS Reply';
    }

    /**
     * Sound
     */
    const soundEnabled = retrievePushbulletSoundEnabled();
    if (soundEnabled) {
        const soundFile = retrievePushbulletSoundFile();
        playSound(soundFile, (error) => {
            if (error) { logger.error(error); }
        });
    }

    /**
     * Create
     */
    const notification = notificationProvider.create(options);

    /**
     * @listens notification:PointerEvent#click
     */
    notification.on('click', () => {
        logger.debug('notification#click');

        // Open url
        if (push.url) {
            remote.shell.openExternal(push.url, { activate: false }, () => {});
        }

        // Dismiss push
        dismissPushbulletPush(push);
    });

    /**
     * @listens notification:PointerEvent#close
     */
    notification.on('close', () => {
        logger.debug('notification#close');
    });

    /**
     * @listens notification:PointerEvent#reply
     */
    notification.on('reply', (event, reply) => {
        logger.debug('notification#reply');

        pbSms.sendReply(reply, (error) => {
            if (error) {
                return logger.error(error);
            }

            logger.info('sms reply sent', reply);
        });
    });

    /**
     * @listens notification:PointerEvent#error
     * @param {Error} error - Error
     */
    notification.on('error', (error) => {
        logger.error('notification#error', error);
    });

    /**
     * @listens notification:PointerEvent#show
     */
    notification.on('show', (event) => {
        logger.debug('notification#show', event);
    });

    // Show
    notification.show();
};

/**
 * Test if a notification should be shown for this push
 * @param {Object} push - Push Object
 * @returns {Boolean|void}
 */
let shouldShowPush = (push) => {
    //logger.debug('shouldShowPush');

    // Activity
    if (push.hasOwnProperty('active')) {
        // Push is not active
        if (Boolean(push.active) === false) {
            logger.debug('shouldShowPush', false, 'push is not active');
            return false;
        }
    }

    // Direction
    if (push.direction === 'self') {
        // Don't show if Push was dismissed
        if (Boolean(push.dismissed) === true) {
            logger.debug('shouldShowPush', false, 'push was dismissed already');
            return false;
        }
    }

    // SMS
    if (push.type === 'sms_changed') {
        // Don't show if SMS is disabled
        const pushbulletSmsEnabled = retrievePushbulletSmsEnabled();
        if (!pushbulletSmsEnabled) {
            logger.debug('shouldShowPush', false, 'sms mirroring is not enabled');
            return false;
        }
        // Don't show if SMS has no attached notifications
        if (push.notifications.length === 0) {
            logger.debug('shouldShowPush', false, 'sms push is empty');
            return false;
        }
    }

    logger.debug('shouldShowPush:', true, 'type:', push.type);

    return true;
};

/**
 * Show Pushbullet push
 * @param {Object} push - Push Object
 */
let showPush = (push) => {
    //logger.debug('showPush');

    // Test if in snooze mode
    const isSnoozing = (Date.now() < remote.getGlobal('snoozeUntil'));

    if (!isSnoozing && shouldShowPush(push)) {
        createNotification(push);
    }
};

/**
 * Get all Pushbullet Pushes sorted by recency (ascending)
 * @param {Number=} queueLimit - Limit result to fixed number
 * @returns {Array|undefined} List of Pushes
 */
let getRecentPushesList = (queueLimit = 0) => {
    logger.debug('fetchRecentPushes');

    const pb = window.pb;

    let recentPushesList = [];

    // Build list of recent active pushes
    for (let iden in pb.api.pushes.objs) {
        if (pb.api.pushes.objs.hasOwnProperty(iden)) {
            if (shouldShowPush(pb.api.pushes.objs[iden])) {
                recentPushesList.push(pb.api.pushes.objs[iden]);
            }
        }
    }

    // Sort recent pushes by date created
    recentPushesList.sort((pushA, pushB) => {
        const dateA = pushA.created;
        const dateB = pushB.created;

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
 * @param {Array|Object} pushes - Pushbullet push objects
 * @param {Boolean} ignoreDate - Ignore time of push, always show
 * @param {Boolean} updateBadgeCount - Update badge counter
 * @param {Function=} callback - Callback
 * @returns {*}
 */
let enqueuePush = (pushes, ignoreDate = false, updateBadgeCount = true, callback = () => {}) => {
    logger.debug('enqueuePush');

    pushes = _.isArray(pushes) ? pushes : [pushes];

    if (pushes.length === 0) {
        logger.warn('enqueuePush', 'pushes list was empty');
        return callback(null, 0);
    }

    let nextPushesList = pushes;
    let notifyAfter = lastNotificationTimestamp || 0;

    // Remove pushes older than 'lastNotification' from array
    if (Boolean(ignoreDate) === false) {
        nextPushesList = pushes.filter((element) => {
            return (element.created) > notifyAfter;
        });
    }

    nextPushesList.forEach((push, pushIndex) => {
        //logger.debug('enqueuePush', 'push:', push);

        let timeout = setTimeout(() => {

            // Show local notification
            showPush(push);

            // Update saved lastNotification
            if (push.created > notifyAfter) {
                lastNotificationTimestamp = push.created;
                storePushbulletLastNotificationTimestamp(push.created);
            }

            // Last push triggered
            if (nextPushesList.length === (pushIndex + 1)) {
                if (updateBadgeCount) {
                    updateBadge(remote.app.getBadgeCount() + nextPushesList.length);
                }

                callback(null, nextPushesList.length);

                clearTimeout(timeout);
            }
        }, (Math.round(notificationInterval) * (pushIndex + 1)));
    });
};

/**
 * Get all new pushes and show them (if any)
 * @param {Function=} callback - Callback
 * @public
 */
let enqueueRecentPushes = (callback = () => {}) => {
    logger.debug('enqueueRecentPushes');

    const pushesList = getRecentPushesList(maxRecentNotifications);

    enqueuePush(pushesList, true, false, (err, count) => {
        if (err) {
            logger.error('enqueueRecentPushes', err);
            return callback(err);
        }

        callback(null, count);
    });
};

/**
 * Init
 */
let init = () => {
    logger.debug('init');

    lastNotificationTimestamp = retrievePushbulletLastNotificationTimestamp();
    appSoundVolume = retrievePushbulletSoundVolume();
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
    enqueueRecentPushes: enqueueRecentPushes,
    updateBadge: updateBadge
};
