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
const { ipcRenderer, remote } = require('electron');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path').path;
const editorContextMenu = remote.require('electron-editor-context-menu');
const fileUrl = require('file-url');
const stringFormat = require('string-format-obj');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const connectivityService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'connectivity-service'));

/**
 * Modules
 * Pushbullet
 */
const pbDevices = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pb', 'device'));
const pbClipboard = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pb', 'clipboard'));
const pbPush = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pb', 'push'));


/**
 * Settings
 * @global
 */
let globalElectronSettings = remote.getGlobal('electronSettings');

/**
 * Play Audio
 * @param {String} filePath - Path to WAV audio
 * @param {Function=} callback  - Callback
 */
let playSoundFile = function(filePath, callback) {
    let cb = callback || function() {},
        soundFile = fileUrl(filePath),
        AudioElement = new Audio(soundFile);

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

    globalElectronSettings.get('internal.soundVolume').then(soundVolume => {
        AudioElement.volume = parseFloat(soundVolume);
        AudioElement.play();
    });
};

/**
 * Notification
 * @constant
 * @default
 */
let defaultPollingInterval = 1000,
    notificationInterval = 3000,
    maxRecentNotifications = 5;

/**
 * Notification Defaults
 * @constant
 * @default
 */
const NotificationDefaults = {
    push: {},
    type: 'note',
    title: null,
    body: null,
    url: null,
    icon: null
};

/**
 * Notification Tags
 * @global
 */
const notificationTags = {
    alien_monster: '👾',
    clinking_beer_mugs: '🍻',
    desktop_computer: '🖥',
    dvd: '📀',
    floppy_disk: '💾',
    kaaba: '🕋',
    keyboard: '⌨️',
    laptop: '💻',
    minidisc: '💽',
    newspaper: '📰',
    package: '📦',
    radio: '📻',
    robot_face: '🤖',
    speaking_silhouette_head: '🗣',
    stopwatch: '⏱',
    television: '📺'
};

/**
 * Parse Notification Tags
 * @param {String} content - Notification Content
 * @param {Object} dictionary - Tag Dictionary
 * @return {String} - Formatted String
 * @global
 * @example {social} New entry at reddit.com/subreddits/pushbullet'
 */
let parseNotificationTags = function(content, dictionary) {
    return stringFormat(content, dictionary);
};

/**
 * Remove Notification Tags
 * @param {String} content - Notification Content
 * @param {Object} dictionary - Tag Dictionary
 * @return {String} - Formatted String
 * @global
 * @example {social} New entry at reddit.com/subreddits/pushbullet'
 */
let removeNotificationTags = function(content, dictionary) {
    let newDictionary = _.clone(dictionary);
    for (let tagName in newDictionary) {
        if (newDictionary.hasOwnProperty(tagName)) {
            newDictionary[tagName] = '';
        }
    }
    return parseNotificationTags(content, newDictionary);
};

/**
 * Notification constructor reference
 */
let NotificationDefault = Notification;

/**
 * Find images for push properties
 * @param {Object} push - Pushbullet push (https://docs.pushbullet.com/#push)
 * @returns {String} Image URI
 */
let getIconForPushbulletPush = function(push) {

    let imageUrl;

    // Accounts (Google, Facebook ..)
    let accountImage,
        accountIdShort = push['receiver_iden'],
        accountList = window.pb.api.accounts.all;

    for (let account of accountList) {
        if (account['iden'].startsWith(accountIdShort)) {
            accountImage = account['image_url'];
        }
    }

    // Channels (IFTTT, Zapier ..)
    let channelImage,
        channelId = push['client_iden'],
        channelList = window.pb.api.grants.all;

    for (let channel of channelList) {
        if (channel['client']['iden'] === channelId) {
            channelImage = channel['client']['image_url'];
        }
    }

    // Devices (Phone, Tablet ..)
    let deviceImage,
        deviceId = push['source_device_iden'],
        deviceList = window.pb.api.devices.all;

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

//noinspection JSUnresolvedVariable
/**
 * Notification Decorator
 */
Notification = function(pushTitle, pushObject) {

    /**
     * Notification attributes
     */
    let push = pushObject || NotificationDefaults.push,
        iden = push['iden'],
        type = push['type'] || NotificationDefaults.type,
        title = push['title'] || pushTitle || push['body'] || NotificationDefaults.title,
        body = push['body'] || push['title'] || NotificationDefaults.body,
        url = NotificationDefaults.url,
        icon = getIconForPushbulletPush(push) || NotificationDefaults.ICON;

    /**
     *  Notification buttons
     */
    // TODO
    // let buttons = [] ;

    /**
     * Push Type
     * @see {@link https://docs.pushbullet.com/#push|Pushbullet API}
     */
    switch (type) {
        case 'link':
            title = title || push['url'];
            body = body || push['url'];
            url = push['url'];
            break;
        case 'note':
            body = push['body'] || push['title'];
            break;
        case 'file':
            title = title || push['file_name'];
            url = push['file_url'];
            icon = push['image_url'] || icon;

            // Do not show mimetype for images
            if (push['file_type'].startsWith('image')) {
                body = '';
            } else {
                body = push['file_type'];
            }

            break;
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
    title = _.trim(parseNotificationTags(title, notificationTags));
    body = _.trim(removeNotificationTags(body, notificationTags));

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
    let notification = new NotificationDefault(options.title, options);

    globalElectronSettings.get('user.playSoundEffects')
        .then(playSoundEffects => {
            if (playSoundEffects === true) {
                globalElectronSettings.get('user.soundFile')
                    .then(notificationFile => {
                        playSoundFile(notificationFile, function(err, file) {
                            if (err) {
                                logger.error('playSoundFile', file, err);
                            }
                        });
                    });
            }
        });

    /**
     * @listens notification:PointerEvent#click
     * @fires ipcRenderer:ipcEvent#notification-click
     */
    notification.addEventListener('click', () => {
        ipcRenderer.send('notification-click', options);
    });

    // DEBUG
    logger.devtools('notification', notification.title);

    return notification;
};

Notification.prototype = NotificationDefault.prototype;
Notification.permission = NotificationDefault.permission;
Notification.requestPermission = NotificationDefault.requestPermission.bind(Notification);

/**
 * Show Notification
 */
window.showNotification = function(push) {
    // If snooze is active, global.snoozeUntil is === 0
    let isSnoozed = Boolean(remote.getGlobal('snoozeUntil'));

    // DEBUG
    logger.devtools('snoozed', isSnoozed);

    if (Date.now() < remote.getGlobal('snoozeUntil')) {
        return;
    }

    if ((push.active && push.active === true) || (push.type && push.type === 'mirror')) {
        return new Notification(null, push);
    }
};

/**
 * Enqueue multiple pushes (throttled)
 * @param {Array} pushesList - Array of Pushbullet pushes
 * @param {Boolean} filterPushes - Hide Pushes already shown
 * @param {Function} cb - Callback
 * @return {*}
 */
window.enqueuePushes = function(pushesList, filterPushes, cb) {

    let callback = cb || function() {},
        self = this;

    if (pushesList.length === 0) {
        return callback(pushesList.length);
    }

    globalElectronSettings.get('internal.lastNotification')
        .then(lastNotification => {

            let nextPushesList = pushesList,
                notifyAfter = lastNotification || 0;

            // Remove pushes older than 'internal.lastNotification' from array
            if (filterPushes) {
                nextPushesList = pushesList.filter(function(element) {
                    return (element.modified || element.created) > notifyAfter;
                });
            }

            nextPushesList.forEach(function(push, pushIndex) {
                let notificationTimeout = setTimeout(function() {

                    // Show local notification
                    window.showNotification(push);

                    // Update 'internal.lastNotification' with timestamp from most recent push
                    if (push.modified > notifyAfter) {
                        // Sync Settings
                        globalElectronSettings.set('internal.lastNotification', push.modified)
                            .then(() => {});
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
 * Get all new pushes and show them (if any)
 */
window.enqueueRecentPushes = function(cb) {
    let callback = cb || function() {},
        pushesList = window.getPushes(maxRecentNotifications);

    window.enqueuePushes(pushesList, false, function(length) {
        callback(length);
    });
};

/**
 * Register single push for notification
 * @param {Object} push - Push Object
 * @param {Function=} cb - Callback
 */
window.enqueueSinglePush = function(push, cb) {
    // DEBUG
    logger.devtools(`window.enqueueSinglePush()`, `length: ${Object.keys(push).length}`);

    let callback = cb || function() {},
        pushesList = [push];

    window.enqueuePushes(pushesList, true, function(length) {
        callback(length);
    });
};

/**
 * Add margin for Title bar
 */
window.addTitlebarMargin = function() {
    window.document.getElementById('sink').style['background-color'] = '#4AB367';
    window.document.getElementById('mobile-header').style['margin-top'] = '12px';
    window.document.getElementById('mobile-header').style['box-shadow'] = 'none';
};

/**
 * Remove setup menu item
 */
window.optimizeMenu = function() {
    let pollingInterval = setInterval(function() {
        if (!window.pb) {
            return;
        }

        window.pb.api.account.preferences.setup_done = true;
        window.pb.sidebar.update();
        window.onecup['goto']('/#people');

        clearInterval(pollingInterval);
    }, defaultPollingInterval, this);
};

/**
 * Pushbullet Debugger
 */
window.enableVendorDebug = function() {
    if (!isDebug) {
        return;
    }

    let pollingInterval = setInterval(function() {
        if (!window.pb) {
            return;
        }

        window.pb.DEBUG = true;

        clearInterval(pollingInterval);
    }, defaultPollingInterval, this);
};

/**
 * Proxy pb.ws
 */
window.createWSProxy = function() {
    let pollingInterval = setInterval(function() {
        if (!window.pb) {
            return;
        }
        window.pb.ws = new Proxy(window.pb.ws, {
            set: function(target, name, value) {
                if (name === 'connected') {
                    // DEBUG
                    logger.devtools(`connected`);
                }
                target[name] = value;
            }
        });

        clearInterval(pollingInterval);
    }, defaultPollingInterval, this);
};

/**
 * Proxy pb.ws
 */
window.createErrorProxy = function() {
    let pollingInterval = setInterval(function() {
        if (!window.pb) {
            return;
        }
        window.pb.error = new Proxy(window.pb.error, {
            set: function(target, name, value) {
                target[name] = value;
            }
        });
        clearInterval(pollingInterval);
    }, defaultPollingInterval, this);
};

/**
 * Proxy pb.api.pushes.objs
 */
window.createPushProxy = function() {
    let pollingInterval = setInterval(function() {
        if (!window.pb) {
            return;
        }

        window.pb.api.pushes.objs = new Proxy(window.pb.api.pushes.objs, {
            set: function(target, name, push) {
                if (name in target) {
                    return false;
                }

                // Check if app handles push
                let appIsTarget = true;
                if (push.target_device_iden &&
                    window.pb.api.devices.objs[push.target_device_iden] &&
                    window.pb.api.devices.objs[push.target_device_iden].model) {
                    if (window.pb.api.devices.objs[push.target_device_iden].model !== 'pb-for-desktop') {
                        appIsTarget = false;
                    }
                }

                target[name] = push;

                if (appIsTarget) {
                    window.enqueueSinglePush(push);
                }

                // DEBUG
                logger.devtools('window.createPushProxy', `appIsTarget: ${appIsTarget}`);
                logger.devtools('window.createPushProxy', `window.pb.api.pushes.objs[${name}]`);
                logger.devtools('window.createPushProxy', `length: ${Object.keys(push).length}`);
            }
        });

        // DEBUG
        logger.devtools('window.createPushProxy');

        clearInterval(pollingInterval);
    }, defaultPollingInterval, this);
};

/**
 * Listen for Pushbullet Stream
 */
window.addWSMessageHandler = function() {
    let pollingInterval = setInterval(function() {
        if (!window.pb) {
            return;
        }

        /**
         * @listens window:Event#message
         */
        window.pb.ws.socket.addEventListener('message', (ev) => {
            let message;

            try {
                message = JSON.parse(ev.data);
            } catch (err) {
                logger.error('window.addWSMessageHandler', err);
            }

            let messageType = message.type;
            let pushObject = message.push;


            if (pushObject && messageType === 'push') {
                if (pushObject.type && pushObject.type === 'mirror') {
                    window.showNotification(pushObject);

                    // DEBUG
                    logger.devtools('window.addWSMessageHandler()', 'window.showNotification(pushObject)');
                }
                if (pushObject.type && pushObject.type === 'dismissal') {
                    // TODO: Implement mirror dismissals
                }
                if (pushObject.type && pushObject.type === 'clip') {
                    // Handled in pbClipboard
                }
            }

            // DEBUG
            // logger.devtools('window.addWSMessageHandler', message);
        });

        clearInterval(pollingInterval);
    }, defaultPollingInterval, this);
};

/**
 * Get all Pushbullet Pushes sorted by recency (ascending)
 * @param {Number..} limit - Limit result to fixed number
 * @returns {Array|undefined} List of Pushes
 */
window.getPushes = function(limit) {

    if (!window.pb) {
        return;
    }

    let queueLimit = limit || 0;

    // Get hashmap of all pushes
    let pushesReference = window.pb.api.pushes.objs,
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
 * Add native context menus
 * @listens window:PointerEvent#contextmenu
 */
window.addEventListener('contextmenu', (ev) => {
    if (!ev.target['closest']('textarea, input, [contenteditable="true"]')) {
        return;
    }

    let menu = editorContextMenu();

    let menuTimeout = setTimeout(function() {
        menu.popup(remote.getCurrentWindow());
        return clearTimeout(menuTimeout);
    }, 60);
});


/**
 * @listens window:Event#load
 * @fires ipcRenderer:ipcEvent#network
 */
let initialize = () => {
    connectivityService.once('connection', (message) => {
        if (message === 'online') {
            window.enableVendorDebug();
            window.optimizeMenu();
            window.createErrorProxy();
            window.createWSProxy();
            window.createPushProxy();
            window.addWSMessageHandler();

            globalElectronSettings.get('user.replayOnLaunch').then(replayOnLaunch => {
                if (replayOnLaunch) {
                    window.enqueueRecentPushes();
                }
            });

            // DEBUG
            logger.devtools('window:load', 'reachable', connectivityService.online);
        }
    });

};

/**
 * @listens window:Event#load
 * @fires ipcRenderer:ipcEvent#network
 */
window.addEventListener('load', () => {
    initialize();
});
