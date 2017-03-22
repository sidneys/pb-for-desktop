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
const appRootPath = require('app-root-path').path;
const electronEditorContextMenu = remote.require('electron-editor-context-menu');

/**
 * Modules
 * Internal
 * @constant
 */
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'managers', 'configuration-manager'));
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const pbClipboard = require(path.join(appRootPath, 'app', 'scripts', 'pushbullet', 'clipboard')); // jshint ignore:line
const pbDevices = require(path.join(appRootPath, 'app', 'scripts', 'pushbullet', 'device')); // jshint ignore:line
const pbPush = require(path.join(appRootPath, 'app', 'scripts', 'pushbullet', 'push')); // jshint ignore:line
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));

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
const defaultHostname = 'www.pushbullet.com';
const defaultInterval = 500;
const defaultTimeout = 500;


/**
 * User Interface tweaks
 */
let addUiTweaks = () => {
    logger.debug('addUiTweaks');

    const pb = window.pb;
    const onecup = window.onecup;

    let interval = setInterval(() => {
        if (!pb || !onecup) { return; }

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
        document.querySelectorAll('div').forEach((el) => {
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
        if (!pb) { return; }

        pb.error = new Proxy(pb.error, {
            set: function(target, name, value) {
                target[name] = value;
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
        if (!pb) { return; }

        pb.api.pushes.objs = new Proxy(pb.api.pushes.objs, {
            set: (pushesObj, iden, newPush) => {
                // Check if push object exists
                if (iden in pushesObj) { return false; }

                // Check if push with iden exists
                let pushExists = Boolean(pb.api.pushes.all.filter(function(push) { return push.iden === newPush.iden; }).length);
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

    let interval = setInterval(() => {
        if (!pb) { return; }

        /**
         * @listens window:Event#message
         */
        pb.ws.socket.addEventListener('message', (ev) => {
            let message;

            try {
                message = JSON.parse(ev.data);
            } catch (error) {
                logger.error('pb.ws.socket:message', error.message);
                return;
            }

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
                    pbPush.create(message.push);
                    break;
                /** Clipboard */
                case 'clip':
                    // Handled in pbClipboard
                    break;
                /** Dismissing */
                case 'dismissal':
                    pbPush.dismiss(message.push.notification_id);
            }

            logger.debug('pb.ws.socket:message', 'message.push.type', message.push.type);
        });

        clearInterval(interval);
    }, defaultInterval);
};

// /**
//  * Hook window.track(), dispatch as window:CustomEvent
//  * @fires window:CustomEvent#label
//  */
// let registerEventHook = () => {
//     logger.debug('registerTrackingHook');
//
//     let originalTrack = window.track;
//         window.track = () => {
//             const args = Array.from(arguments);
//             const label = args[0] || '';
//             const detail = args[1] || {};
//
//             window.dispatchEvent(new CustomEvent(label, { detail: detail }));
//
//            originalTrack.apply(this, arguments);
//     };
// };

/**
 * Init
 */
let init = () => {
    logger.debug('init');

    registerErrorProxy();
    registerPushProxy();
    addWebsocketEventHandlers();
    addUiTweaks();

    if (isDebug) { window.pb.DEBUG = true; }

    if (configurationManager.getItem('replayOnLaunch').get()) {
        pbPush.enqueueRecentPushes();
    }
};


/**
 * @listens window:Event#resize
 */
window.addEventListener('resize', () => {
    logger.debug('window#resize');

    addUiTweaks();
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

// /**
//  * @listens window:CustomEvent#goto
//  */
// window.addEventListener('goto', () => {
//     logger.debug('window#goto');
// });

/**
 * @listens window:Event#load
 */
window.addEventListener('load', () => {
    logger.debug('device', 'window#load');

    init();
});

/**
 * @listens process#loaded
 */
const _setImmediate = setImmediate;
process.once('loaded', function() {
  global.setImmediate = _setImmediate;
});
