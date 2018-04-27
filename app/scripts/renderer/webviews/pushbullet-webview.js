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
const { ipcRenderer } = electron;

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path')['path'];
const electronEditorContextMenu = remote.require('electron-editor-context-menu');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require('@sidneys/logger')({ write: true });
const domTools = require('@sidneys/dom-tools');
const isDebug = require('@sidneys/is-env')('debug');
const notificationProvider = remote.require('@sidneys/electron-notification-provider');
const platformTools = require('@sidneys/platform-tools');
const configurationManager = remote.require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));
/* eslint-disable no-unused-vars */
const pbClipboard = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'clipboard'));
const pbDevices = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'device'));
const pbPush = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'push'));
/* eslint-enable */

/**
 * Application
 * @constant
 * @default
 */
const appIcon = path.join(appRootPath, 'icons', platformTools.type, `icon${platformTools.iconImageExtension(platformTools.type)}`);
const appName = remote.getGlobal('manifest').name;

/**
 * @constant
 * @default
 */
const defaultInterval = 500;
const defaultTimeout = 500;


/** @namespace item.created */
/** @namespace newPush.target_device_iden */
/** @namespace pb.api.devices */
/** @namespace pb.api.pushes */
/** @namespace pb.e2e */
/** @namespace pb.e2e.decrypt */
/** @namespace push.iden */
/** @namespace window.onecup */
/** @namespace window.pb */

/**
 * Retrieve PushbulletLastNotificationTimestamp
 * @return {Number} - timestamp
 */
let retrievePushbulletLastNotificationTimestamp = () => configurationManager('pushbulletLastNotificationTimestamp').get();

/**
 * Retrieve PushbulletRepeatRecentNotifications
 * @return {Boolean}
 */
let retrievePushbulletRepeatRecentNotifications = () => configurationManager('pushbulletRepeatRecentNotifications').get();


/**
 * Check if item push is targeted to application
 * @param {String} targetIden - Pushbullet API element iden(tity)
 * @returns {Boolean|void} - True if target
 */
let appIsTargeted = (targetIden) => {
    const pb = window.pb;
    const targetDeviceModel = pb.api && pb.api.devices && pb.api.devices.objs && pb.api.devices.objs[targetIden] && pb.api.devices.objs[targetIden].model;

    if (targetDeviceModel === 'pb-for-desktop') {
        return true;
    }
};


/**
 * Adds application  UI keyboard navigation
 */
let injectAppKeyboardNavigation = () => {
    logger.debug('injectAppKeyboardNavigation');

    // Get current button elements
    let buttonElementList = document.querySelectorAll('.pointer');

    // Add interaction
    buttonElementList.forEach((element) => {
        element.setAttribute('tabindex', 0);
        element.onkeyup = (event) => {
            logger.debug('injectAppKeyboardNavigation', 'element.onkeyup');

            // Require Enter or Space key
            if ([13, 32].includes(event.keyCode)) {
                element.click();
            }
    	}
    })
}

/**
 * Adds push message keyboard navigation & text selection
 */
let injectMessageKeyboardNavigation = () => {
    logger.debug('injectMessageKeyboardNavigation');

    // Get current message elements
    let pushElementList = document.querySelectorAll('.pushwrap .text-part > div');

    // Add interaction
    pushElementList.forEach((element) => {
        element.style.userSelect = 'all';
        element.setAttribute('tabindex', 0);

        // Ignore elements with no textual content
        if (!Boolean(element.textContent.trim())) { return; }

        element.onfocus = (event) => {
            logger.debug('injectAppKeyboardNavigation', 'element.onfocus.onkeyup');

            const range = document.createRange();
            range.selectNodeContents(element);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
    	}
    })
}

/**
 * User Interface tweaks
 */
let addInterfaceEnhancements = () => {
    logger.debug('addInterfaceEnhancements');

    const pb = window.pb;

    let interval = setInterval(() => {
        if (!(pb && pb.api && pb.api.account)) { return; }

        // Close Setup Wizard
        pb.api.account['preferences']['setup_done'] = true;
        pb.sidebar.update();

        // Go to Settings
        window.onecup['goto']('/#settings');

        clearInterval(interval);
    }, defaultInterval);
};

/**
 * Proxy pb.ws
 */
let registerErrorProxy = () => {
    logger.debug('registerErrorProxy');

    const pb = window.pb;

    let interval = setInterval(() => {
        if (!(pb && pb.error)) { return; }

        pb.error = new Proxy(pb.error, {
            set: (pbError, property, value) => {
                //logger.debug('pb.error', 'set()', 'property:', property, 'value:', value);

                if (property === 'title' && _.isString(value)) {
                    if (value.includes('Network')) {
                        const isOnline = false;

                        ipcRenderer.send('online', isOnline);
                        ipcRenderer.sendToHost('online', isOnline);
                    }
                }

                pbError[property] = value;
            }
        });

        clearInterval(interval);
    }, defaultInterval);
};

/**
 * Proxy pb.api.texts.objs
 */
let registerTextsProxy = () => {
    logger.debug('registerTextsProxy');

    /** @namespace pb.api.texts */
    const pb = window.pb;

    let interval = setInterval(() => {
        if (!(pb && pb.api && pb.api.texts)) { return; }

        pb.api.texts.objs = new Proxy(pb.api.texts.objs, {
            set: (textsObjs, property, value) => {
                logger.debug('pb.api.texts.objs', 'set()', 'property:', property, 'value:', value);

                // Check if text with iden exists
                let exists = Boolean(pb.api.texts.all.filter((text) => {
                    return text.iden === value.iden;
                }).length);

                if (!exists) {
                    const isTarget = value.data && value.data.hasOwnProperty('target_device_iden') ? appIsTargeted(value.data.target_device_iden) : true;

                    if (isTarget) {
                        pbPush.enqueuePush(value);
                    }
                }

                textsObjs[property] = value;
            }
        });

        clearInterval(interval);
    }, defaultInterval);
};

/**
 * Proxy pb.api.pushes.objs
 */
let registerPushProxy = () => {
    logger.debug('registerPushProxy');

    const pb = window.pb;

    let interval = setInterval(() => {
        if (!(pb && pb.api && pb.api.pushes)) { return; }

        pb.api.pushes.objs = new Proxy(pb.api.pushes.objs, {
            set: (pushesObjs, property, value) => {

                // Check if push with iden exists
                let exists = Boolean(pb.api.pushes.all.filter((push) => {
                    return push.iden === value.iden;
                }).length);

                if (!exists) {
                    const isTarget = value.hasOwnProperty('target_device_iden') ? appIsTargeted(value.target_device_iden) : true;
                    const isIncoming = value.hasOwnProperty('direction') ? value.direction !== 'outgoing' : true;

                    if (isTarget && isIncoming) {
                        pbPush.enqueuePush(value);
                    }
                }

                pushesObjs[property] = value;
            }
        });

        clearInterval(interval);
    }, defaultInterval);
};

/**
 * Listen for Pushbullet Stream
 */
let addWebsocketEventHandlers = () => {
    logger.debug('addWebsocketEventHandlers');

    const pb = window.pb;

    let interval = setInterval(() => {
        if (!(pb && pb.ws && pb.ws.socket)) { return; }

        pb.ws.socket.addEventListener('message', (ev) => {
            logger.debug('pb.ws.socket#message');

            let message;

            try {
                message = JSON.parse(ev.data);
            } catch (err) {
                logger.warn('pb.ws.socket#message', err.message);
                return;
            }

            if (message.type !== 'push') { return; }

            /**
             * Decryption
             */
            if (message.push.encrypted) {
                if (!pb.e2e.enabled) {
                    const notificationOptions = {
                        body: `Could not decrypt message.${os.EOL}Click here to enter your password.`,
                        icon: appIcon,
                        subtitle: 'End-to-End Encryption',
                        title: appName
                    };

                    /**
                     * Create
                     */
                    const notification = notificationProvider.create(notificationOptions);

                    /**
                     * @listens notification:PointerEvent#click
                     */
                    notification.on('click', () => {
                        logger.debug('notification#click');

                        window.onecup['goto']('/#settings');
                    });

                    /**
                     * Show
                     */
                    notification.show();
                } else {
                    try {
                        message.push = JSON.parse(pb.e2e.decrypt(message.push.ciphertext));
                    } catch (error) {
                        logger.warn('pb.ws.socket#message', 'error.message:', error.message);
                        return;
                    }
                }
            }

            if (!(message.push && message.push.type)) { return; }

            logger.debug('pb.ws.socket#message', 'message.push.type:', message.push.type);

            switch (message.push.type) {
                /** Mirroring */
                case 'mirror':
                /** SMS */
                case 'sms_changed':
                    pbPush.enqueuePush(message.push, true);
                    break;
                /** Clipboard */
                case 'clip':
                    pbClipboard.receiveClip(message.push);
                    break;
            }
        });

        clearInterval(interval);
    }, defaultInterval);
};

/**
 * Login Pushbullet User
 */
let loginPushbulletUser = () => {
    logger.debug('loginPushbulletUser');

    const pb = window.pb;

    let interval = setInterval(() => {
        if (!(pb && pb.account && pb.account.active)) { return; }
        logger.info('pushbullet', 'logged in');

        pb.DEBUG = isDebug;

        registerErrorProxy();
        registerPushProxy();
        registerTextsProxy();
        addWebsocketEventHandlers();

        const lastNotificationTimestamp = retrievePushbulletLastNotificationTimestamp();
        if (lastNotificationTimestamp) {
            let unreadCount = (pb.api.pushes.all.concat(pb.api.texts.all)).filter((item) => {
                return (item.created) > lastNotificationTimestamp;
            }).length;

            logger.debug('loginPushbulletUser', 'unreadCount:', unreadCount);

            pbPush.updateBadge(unreadCount);
        }

        if (retrievePushbulletRepeatRecentNotifications()) {
            pbPush.enqueueRecentPushes((err, count) => {
                logger.info('replayed pushes on after launch:', count);
            });
        }

        const isLogin = true;

        ipcRenderer.send('login', isLogin);
        ipcRenderer.sendToHost('login', isLogin);

        addInterfaceEnhancements();

        clearInterval(interval);
    }, defaultInterval);
};


/**
 * Init
 */
let init = () => {
    logger.debug('init');

    const pb = window.pb;

    let interval = setInterval(() => {
        if (!pb || !navigator.onLine) { return; }
        logger.info('pushbullet', 'online');

        const isOnline = true;

        ipcRenderer.send('online', isOnline);
        ipcRenderer.sendToHost('online', isOnline);

        loginPushbulletUser();

        clearInterval(interval);
    }, defaultInterval);
};


/**
 * @listens process#loaded
 */
const _setImmediate = setImmediate;
process.once('loaded', () => {
    global.setImmediate = _setImmediate;
});

/**
 * @listens ipcRenderer#did-navigate-in-page
 */
ipcRenderer.on('did-navigate-in-page', (event) => {
    logger.debug('ipcRenderer#did-navigate-in-page');

    // Inject interface improvements
    injectAppKeyboardNavigation();
    injectMessageKeyboardNavigation();
});

/**
 * @listens window:Event#contextmenu
 */
window.addEventListener('contextmenu', (ev) => {
    logger.debug('window#contextmenu');

    if (!ev.target['closest']('textarea, input, [contenteditable="true"]')) {
        return;
    }

    let timeout = setTimeout(() => {
        electronEditorContextMenu().popup();

        clearTimeout(timeout);
    }, defaultTimeout);
});

/**
 * @listens window:Event#offline
 */
window.addEventListener('offline', () => {
    logger.debug('window#offline');

    const isOnline = false;

    ipcRenderer.send('online', isOnline);
    ipcRenderer.sendToHost('online', isOnline);
});

/**
 * @listens window:Event#offline
 */
window.addEventListener('online', () => {
    logger.debug('window#online');

    const isOnline = true;

    ipcRenderer.send('online', isOnline);
    ipcRenderer.sendToHost('online', isOnline);
});

/**
 * @listens window:Event#load
 */
window.addEventListener('load', () => {
    logger.debug('window#load');

    domTools.addPlatformClass();

    init();
});

