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
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));
const domHelper = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'utils', 'dom-helper'));
const isDebug = require(path.join(appRootPath, 'lib', 'is-env'))('debug');
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const pbClipboard = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'clipboard')); // jshint ignore:line
const pbDevices = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'device')); // jshint ignore:line
const pbPush = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'push')); // jshint ignore:line

/**
 * Application
 * @constant
 * @default
 */
const appIcon = path.join(appRootPath, 'icons', platformHelper.type, `icon${platformHelper.iconImageExtension(platformHelper.type)}`);

/**
 * @constant
 * @default
 */
const defaultInterval = 500;
const defaultTimeout = 500;

/**
 * @default
 */
let didDisconnect = false;


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
                        didDisconnect = true;

                        ipcRenderer.send('network', 'offline', didDisconnect);
                        ipcRenderer.sendToHost('network', 'offline', didDisconnect);
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


    /** @namespace pb.api.pushes */
    /** @namespace pb.e2e */
    /** @namespace window.onecup */
    /** @namespace window.pb */
    /** @namespace push.iden */
    /** @namespace newPush.target_device_iden */
    const pb = window.pb;

    let interval = setInterval(() => {
        if (!(pb && pb.api && pb.api.pushes)) { return; }

        pb.api.pushes.objs = new Proxy(pb.api.pushes.objs, {
            set: (pushesObjs, property, value) => {
                //logger.debug('pb.api.pushes.objs', 'set()', 'property:', property, 'value:', value);

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

            //logger.debug('pb.ws.socket#message', 'ev:');
            //console.dir(ev)

            if (message.type !== 'push') { return; }
            // Decrypt
            if (message.push.encrypted) {
                if (!pb.e2e.enabled) {
                    let notification = new Notification(`End-to-End Encryption`, {
                        body: `Could not open message.${os.EOL}Click here to enter your password.`,
                        icon: appIcon
                    });
                    notification.addEventListener('click', () => { window.onecup['goto']('/#settings'); });
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

        let lastNotification = configurationManager('lastNotification').get();
        if (lastNotification) {
            let unreadCount = (pb.api.pushes.all.concat(pb.api.texts.all)).filter((item) => {
                return (item.created) > lastNotification;
            }).length;

            logger.debug('loginPushbulletUser', 'unreadCount:', unreadCount);

            pbPush.updateBadge(unreadCount);
        }

        if (configurationManager('replayOnLaunch').get() === true) {
            pbPush.enqueueRecentPushes((err, count) => {
                logger.info('replayed pushes on after launch:', count);
            });
        }

        ipcRenderer.send('account', 'login');
        ipcRenderer.sendToHost('account', 'login');

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

        if (didDisconnect === true) { didDisconnect = false; }
        ipcRenderer.send('network', 'online', didDisconnect);
        ipcRenderer.sendToHost('network', 'online', didDisconnect);

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

    didDisconnect = true;

    ipcRenderer.send('network', 'offline', didDisconnect);
    ipcRenderer.sendToHost('network', 'offline', didDisconnect);
});

/**
 * @listens window:Event#offline
 */
window.addEventListener('online', () => {
    logger.debug('window#online');

    ipcRenderer.send('network', 'online', didDisconnect);
    ipcRenderer.sendToHost('network', 'online', didDisconnect);
});

/**
 * @listens window:Event#load
 */
window.addEventListener('load', () => {
    logger.debug('window#load');

    domHelper.addPlatformClass();

    init();
});

