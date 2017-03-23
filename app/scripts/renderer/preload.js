'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const os = require('os');
const path = require('path');
const util = require('util');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { remote } = electron;
const { ipcRenderer, webFrame } = electron; // jshint ignore:line

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
const electronEditorContextMenu = remote.require('electron-editor-context-menu');

/**
 * Modules
 * Internal
 * @constant
 */
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));
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
let didDisconnectAfterConnect = false;

/**
 * User Interface tweaks
 */
let addInterfaceEnhancements = () => {
    logger.debug('addUiTweaks');

    const pb = window.pb;
    const onecup = window.onecup;

    let interval = setInterval(() => {
        if (!(pb && pb.api && pb.api.account && onecup)) { return; }

        // Hide wizard
        pb.api.account['preferences']['setup_done'] = true;
        pb.sidebar.update();

        // Initial view
        onecup['goto']('/#settings');

        // Header: remove shadow
        let header = document.getElementById('mobile-header') || document.getElementById('header');
        header.style.boxShadow = 'none';

        // Sink: transparent background
        let sink = document.getElementById('sink');
        sink.style.backgroundColor = 'transparent';

        // Dark areas: transparent background
        let divList = document.querySelectorAll('div');
        divList.forEach((el) => {
            if (el.style.backgroundColor === 'rgb(149, 165, 166)') {
                el.style.backgroundColor = 'transparent';
            }
        });

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
            set: (target, name, value) => {
                logger.debug('registerErrorProxy', 'set:', 'name', name, 'value', value);
                if (name === 'title' && value) {
                    if (target.title.includes('Network')) {
                        didDisconnectAfterConnect = true;

                        ipcRenderer.send('network', 'offline', didDisconnectAfterConnect);
                        ipcRenderer.sendToHost('network', 'offline', didDisconnectAfterConnect);
                    }
                }

                target[name] = value;
            },
            get: function(target, name) {
                //logger.debug('registerErrorProxy', 'get:', 'name', name);
                return target[name];
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
            set: (pushesObj, iden, newPush) => {
                // Check if push object exists
                if (iden in pushesObj) { return false; }

                // Check if push with iden exists
                let pushExists = Boolean(pb.api.pushes.all.filter((push) => {
                    return push.iden === newPush.iden;
                }).length);

                if (pushExists) { return false; }

                // Default: Show push
                let appIsTarget = true;

                // Check if push is targeted to specific device
                let currentDevicesObjs = pb.api.devices.objs;
                let targetDeviceIden = newPush.target_device_iden;
                if (targetDeviceIden && currentDevicesObjs[targetDeviceIden]) {
                    if (currentDevicesObjs[targetDeviceIden].model && (currentDevicesObjs[targetDeviceIden].model !== 'pb-for-desktop')) {
                        appIsTarget = false;
                    }
                }

                // Check if push is directed
                let targetDirection = newPush.direction;
                if (targetDirection && targetDirection === 'outgoing') {
                    appIsTarget = false;
                }

                if (appIsTarget) { pbPush.enqueuePush(newPush); }

                pushesObj[iden] = newPush;
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
    const onecup = window.onecup;

    let interval = setInterval(() => {
        if (!(pb && pb.ws && pb.ws.socket && onecup)) { return; }

        /**
         * @listens window:Event#message
         */
        pb.ws.socket.addEventListener('error', (ev) => {
            logger.debug('socket#error');
            //console.dir(ev);
        });

        pb.ws.socket.addEventListener('message', (ev) => {
            logger.debug('socket#message');
            //console.dir(ev);

            let message;

            try {
                message = JSON.parse(ev.data);
            } catch (error) {
                logger.error('pb.ws.socket:message', error.message);
                return;
            }

            logger.debug('message', util.inspect(message));

            if (message.type !== 'push') { return; }
            // Decrypt
            if (message.push.encrypted) {
                if (!pb.e2e.enabled) {
                    let notification = new Notification(`End-to-End Encryption`, {
                        body: `Could not open message.${os.EOL}Click here to enter your password.`,
                        icon: appIcon
                    });
                    notification.addEventListener('click', () => { onecup['goto']('/#settings'); });
                } else {
                    try {
                        message.push = JSON.parse(pb.e2e.decrypt(message.push.ciphertext));
                    } catch (error) {
                        logger.error('pb.ws.socket:message', error.message);
                        return;
                    }
                }
            }

            if (!(message.push && message.push.type)) { return; }
            // Display
            switch (message.push.type) {
                /** Mirroring */
                case 'mirror':
                    pbPush.show(message.push);
                    break;
                /** Clipboard (pbClipboard) */
                case 'clip':
                    break;
                /** Clipboard */
                case 'sms_changed':
                    pbPush.show(message.push);
                    break;
            }

            logger.debug('pb.ws.socket:message', 'message.push.type', message.push.type);
        });

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
        if (!(pb && pb.account && pb.account.active) || !navigator.onLine) { return; }

        window.pb.DEBUG = isDebug;

        registerErrorProxy();
        registerPushProxy();
        addWebsocketEventHandlers();
        addInterfaceEnhancements();

        if (configurationManager('replayOnLaunch').get()) {
            pbPush.enqueueRecentPushes((err, count) => {
                logger.info('replayed pushes on after launch:', count);
            });
        }

        logger.info('logged in');

        if (didDisconnectAfterConnect === true) {
            didDisconnectAfterConnect = false;
        }

        ipcRenderer.send('network', 'online', didDisconnectAfterConnect);
        ipcRenderer.sendToHost('network', 'online', didDisconnectAfterConnect);

        clearInterval(interval);
    }, defaultInterval);
};


/**
 * @listens window:Event#resize
 */
window.addEventListener('resize', () => {
    logger.debug('window#resize');

    addInterfaceEnhancements();
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

    didDisconnectAfterConnect = true;

    ipcRenderer.send('network', 'offline', didDisconnectAfterConnect);
    ipcRenderer.sendToHost('network', 'offline', didDisconnectAfterConnect);
});

/**
 * @listens window:Event#offline
 */
window.addEventListener('online', () => {
    logger.debug('window#online');

    ipcRenderer.send('network', 'online', didDisconnectAfterConnect);
    ipcRenderer.sendToHost('network', 'online', didDisconnectAfterConnect);
});

/**
 * @listens window:Event#load
 */
window.addEventListener('load', () => {
    logger.debug('window#load');

    init();
});

/**
 * @listens process#loaded
 */
const _setImmediate = setImmediate;
process.once('loaded', () => {
    global.setImmediate = _setImmediate;
});
