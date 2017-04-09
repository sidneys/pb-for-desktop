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
const { remote } = require('electron');

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
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));


/**
 * Notification
 * @constant
 * @default
 */
const notificationInterval = 2000;
const maxRecentNotifications = 5;


/**
 * @instance
 */
let lastNotification;
let soundVolume;


/**
 * Set application badge count
 * @param {Number} total - Number to set
 *
 */
let updateBadge = (total) => {
    logger.debug('updateBadge');

    if (Boolean(configurationManager('showBadgeCount').get()) === false) { return; }

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

    AudioElement.volume = parseFloat(soundVolume);

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
        return callback(null, url);
    });

    AudioElement.play();
};

/**
 * Find images for Pushbullet push
 * @param {Object} push - Push Object
 * @returns {String} Image URI
 *
 */
let generateImageUrl = (push) => {
    logger.debug('generateImageUrl');

    const pb = window.pb;

    const accountIdShort = push['receiver_iden'];

    let imageUrl;
    let accountImage;

    for (let account of pb.api.accounts.all) {
        if (account['iden'].startsWith(accountIdShort)) {
            accountImage = account['image_url'];
        }
    }

    // Channels (IFTTT, Zapier ..)
    const channelId = push['client_iden'];
    let channelImage;

    for (let channel of pb.api.grants.all) {
        if (channel['client']['iden'] === channelId) {
            channelImage = channel['client']['image_url'];
        }
    }

    // Devices (Phone, Tablet ..)
    const deviceId = push['source_device_iden'];
    let deviceImage;

    for (let device of pb.api.devices.all) {
        if (device['iden'] === deviceId) {
            deviceImage = `http://www.pushbullet.com/img/deviceicons/${device.icon}.png`;
        }
    }

    // SMS
    if (push['type'] === 'sms_changed') {
        deviceImage = 'http://www.pushbullet.com/img/deviceicons/phone.png';
    }

    // Mirroring
    let dataUrl;
    if (push['type'] === 'mirror') {
        dataUrl = `data:image/jpeg;base64,${push.icon}`;
    }

    // Special web sites
    let websiteImage;
    if (push['type'] === 'link') {
        if (getYouTubeID(push['url'])) {
            websiteImage = `https://img.youtube.com/vi/${getYouTubeID(push['url'])}/hqdefault.jpg`;
        }
    }

    // Fallback
    imageUrl = websiteImage || dataUrl || channelImage || deviceImage || accountImage;

    return imageUrl;
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
            // multiple titles: uppercase first title
            titleList[0] = titleList[0].toUpperCase();
            // multiple titles: concat
            title = titleList.join(` | `);
        }
    }

    return {
        body: body,
        title: title
    };
};

/**
 * Decorator Pushbullet Push object
 * @function
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
                push.title = parsed.title;
                push.body = parsed.body;
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

                push.title = `New SMS | ${phonenumber}`;
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
 * Create HTML5 Notification using Pushbullet push object
 * @function
 */
let createNotification = (push) => {
    logger.debug('createNotification');

    push = decoratePushbulletPush(push);

    let notification;

    /**
     * Play sound
     */
    let soundEnabled = configurationManager('soundEnabled').get();
    if (soundEnabled === true) {
        let soundFile = configurationManager('soundFile').get();
        playSound(soundFile, (err) => {
            if (err) {
                logger.error('playSoundFile', err);
            }
        });
    }

    /**
     * Create HTML5 Notification
     */
    notification = new Notification(push.title, {
        title: push.title,
        body: push.body,
        icon: push.icon,
        url: push.url,
        tag: push.iden,
        silent: true
    });


    /**
     * @listens notification:PointerEvent#click
     */
    notification.onclick = () => {
        logger.debug('notification#click');

        // Open url
        if (push.url) {
            remote.shell.openExternal(push.url, { activate: false }, () => {});
        }

        // Dismiss push
        dismissPushbulletPush(push);
    };

    /**
     * @listens notification:PointerEvent#close
     */
    notification.onclose = () => {
        logger.debug('notification#close');
    };

    /**
     * @listens notification:PointerEvent#error
     */
    notification.onerror = (err) => {
        logger.error('notification#error', err);
    };

    /**
     * @listens notification:PointerEvent#show
     */
    notification.onshow = () => {
        logger.debug('notification#show');
    };
};

/**
 * Test if a notification should be shown for this push
 * @param {Object} push - Push Object
 * @returns {Boolean|void}
 */
let shouldShowPush = (push) => {
    //logger.debug('shouldShowPush');

    // Don't show if push is not active
    if (['file', 'link', 'note'].includes(push.type) && !push.active) {
        logger.debug('shouldShowPush', false, 'push is not active');
        return false;
    }

    // Don't show if push was dismissed
    if ((push.direction === 'self') && push.dismissed) {
        logger.debug('shouldShowPush', false, 'push was already dismissed');
        return false;
    }

    // Don't show if push is empty sms
    if ((push.type === 'sms_changed') && (push.notifications.length === 0)) {
        logger.debug('shouldShowPush', false, 'push is empty sms');
        return false;
    }

    logger.debug('shouldShowPush', true);

    return true;
};

/**
 * Show Pushbullet push
 * @param {Object} push - Push Object
 */
let showPush = (push) => {
    //logger.debug('showPush');

    // Test if in snooze mode
    let isSnoozing = (Date.now() < remote.getGlobal('snoozeUntil'));

    if (!isSnoozing && shouldShowPush(push)) {
        createNotification(push);
    }
};

/**
 * Get all Pushbullet Pushes sorted by recency (ascending)
 * @param {Number..} limit - Limit result to fixed number
 * @returns {Array|undefined} List of Pushes
 */
let getRecentPushesList = (limit) => {
    logger.debug('fetchRecentPushes');

    const pb = window.pb;

    const queueLimit = limit || 0;

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
    let notifyAfter = lastNotification || 0;

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
                lastNotification = push.created;
                configurationManager('lastNotification').set(push.created);
            }

            // Last push triggered
            if (nextPushesList.length === (pushIndex + 1)) {
                if (updateBadgeCount) {
                    updateBadge(remote.app.getBadgeCount() + nextPushesList.length);
                }

                callback(null, nextPushesList.length);

                clearTimeout(timeout);
            }
        }, (parseInt(notificationInterval) * (pushIndex + 1)));
    });
};

/**
 * Get all new pushes and show them (if any)
 * @param {Function=} callback - Callback
 * @public
 */
let enqueueRecentPushes = (callback = () => {}) => {
    logger.debug('enqueueRecentPushes');

    let pushesList = getRecentPushesList(maxRecentNotifications);

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

    lastNotification = configurationManager('lastNotification').get();
    soundVolume = parseFloat(configurationManager('soundVolume').get());
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
