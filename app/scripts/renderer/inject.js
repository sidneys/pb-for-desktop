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
const appRootPath = require('app-root-path').path;
const editorContextMenu = remote.require('electron-editor-context-menu');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const connectivityService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'connectivity-service'));

/**
 * Pushbullet
 */
const pbDevices = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'device')); // jshint ignore:line
const pbClipboard = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'clipboard')); // jshint ignore:line
const pbPush = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'push')); // jshint ignore:line


/**
 * @global
 * @default
 */
let defaultInterval = 1000;


/**
 * User Interface tweaks
 */
let applyInterfaceOptimizations = () => {
    logger.debug('inject', 'applyInterfaceOptimizations()');

    let pollingInterval = setTimeout(() => {
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

        clearInterval(pollingInterval);
    }, defaultInterval, this);

};

/**
 * Navigation tweaks
 */
let registerNavigationOptimizations = () => {
    logger.debug('inject', 'registerNavigationOptimizations()');

    let pollingInterval = setInterval(() => {
        if (!window.pb) { return; }

        // Hide setup wizard
        window.pb.api.account.preferences.setup_done = true;
        window.pb.sidebar.update();

        // Set initial view
        window.onecup['goto']('/#people');

        applyInterfaceOptimizations();

        clearInterval(pollingInterval);
    }, defaultInterval, this);
};

/**
 * Proxy pb.ws
 */
let registerErrorProxyobject = () => {
    logger.debug('inject', 'registerErrorProxyobject()');

    let pollingInterval = setInterval(() => {
        if (!window.pb) { return; }
        window.pb.error = new Proxy(window.pb.error, {
            set: function(target, name, value) {
                target[name] = value;
            }
        });
        clearInterval(pollingInterval);
    }, defaultInterval, this);
};

/**
 * Proxy pb.api.pushes.objs
 */
let registerPushProxyobject = () => {
    logger.debug('inject', 'registerPushProxyobject()');

    let pollingInterval = setInterval(() => {
        if (!window.pb) { return; }

        window.pb.api.pushes.objs = new Proxy(window.pb.api.pushes.objs, {
            set: (pushesObj, iden, newPush) => {
                // Check if push object exists
                if (iden in pushesObj) { return false; }

                // Check if push with iden exists
                let pushExists = Boolean(window.pb.api.pushes.all.filter(function(push) { return push.iden === newPush.iden; }).length);
                if (pushExists) { return false; }

                // Default: Show push
                let appIsTarget = true;

                // Check if push is targeted to specific device
                let currentDevicesObjs = window.pb.api.devices.objs;
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

                logger.debug('inject', 'proxy', 'iden', iden, 'appIsTarget', appIsTarget, 'pushExists', pushExists);
                logger.debug('inject', newPush);
            }
        });

        clearInterval(pollingInterval);
    }, defaultInterval, this);
};

/**
 * Listen for Pushbullet Stream
 */
let registerWebsocketListeners = () => {
    logger.debug('inject', 'registerWebsocketListeners()');

    let pollingInterval = setInterval(() => {
        if (!window.pb) { return; }

        /**
         * @listens window:Event#message
         */
        window.pb.ws.socket.addEventListener('message', (ev) => {
            let message;

            try {
                message = JSON.parse(ev.data);
            } catch (err) {
                logger.error('addWebsocketListeners', err);
            }

            let messageType = message.type;
            let pushObject = message.push;


            if (pushObject && messageType === 'push') {
                if (pushObject.type && pushObject.type === 'mirror') {
                    pbPush.create(pushObject);

                    // DEBUG
                    logger.debug('addWebsocketListeners', 'window.showNotification(pushObject)');
                }
                if (pushObject.type && pushObject.type === 'dismissal') {
                    // TODO: Implement mirror dismissals
                }
                if (pushObject.type && pushObject.type === 'clip') {
                    // Handled in pbClipboard
                }
            }
        });

        clearInterval(pollingInterval);
    }, defaultInterval, this);
};

/**
 * Initialize
 */
let initialize = () => {
    /** @listens connectivityService#on */
    connectivityService.once('online', () => {
        logger.debug('inject', 'connectivityService#on');

        registerNavigationOptimizations();
        registerErrorProxyobject();
        registerPushProxyobject();
        registerWebsocketListeners();

        remote.getGlobal('electronSettings').get('user.replayOnLaunch')
            .then(replayOnLaunch => {
                if (replayOnLaunch) {
                    pbPush.enqueueRecentPushes();
                }
            });

        if (window.pb.error.type) {
            window.pb.clear();
            location.reload();
        }


    });
};


/** @listens window#resize */
window.addEventListener('resize', () => {
    logger.debug('inject', 'window#resize');

    applyInterfaceOptimizations();
});

/** @listens window#contextmenu */
window.addEventListener('contextmenu', (ev) => {
    logger.debug('inject', 'window#contextmenu');

    if (!ev.target['closest']('textarea, input, [contenteditable="true"]')) {
        return;
    }

    let menu = editorContextMenu();

    let menuTimeout = setTimeout(() => {
        menu.popup(remote.getCurrentWindow());
        return clearTimeout(menuTimeout);
    }, 60);
});

/** @listens window#on */
window.addEventListener('load', () => {
    logger.debug('inject', 'window#load');

    initialize();
});

