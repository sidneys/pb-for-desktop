'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const os = require('os');
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
const isOnline = require('is-online');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const settings = require(path.join(appRootPath, 'app', 'scripts', 'configuration', 'settings'));


/**
 * App
 * @global
 * @constant
 */
const appIcon = path.join(appRootPath, 'icons', platformHelper.type, `icon${platformHelper.iconImageExtension(platformHelper.type)}`);

/**
 * @global
 * @constant
 */
const defaultInterval = 5000;

//noinspection JSUnusedLocalSymbols
/**
 * Pushbullet
 */
const pbDevices = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'device')); // jshint ignore:line
//noinspection JSUnusedLocalSymbols
const pbClipboard = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'clipboard')); // jshint ignore:line
const pbPush = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'push')); // jshint ignore:line


/**
 * @global
 */
let pb;
let onecup;


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
        if (!pb) { return; }

        // Hide setup wizard
        pb.api.account['preferences']['setup_done'] = true;
        pb.sidebar.update();

        // Set initial view
        onecup['goto']('/#following');

        clearInterval(pollingInterval);
    }, defaultInterval, this);
};

/**
 * Proxy pb.ws
 */
let registerErrorProxyobject = () => {
    logger.debug('inject', 'registerErrorProxyobject()');

    let pollingInterval = setInterval(() => {
        if (!pb) { return; }
        pb.error = new Proxy(pb.error, {
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

                //logger.debug('inject', 'registerPushProxyobject()', 'iden', iden, 'appIsTarget', appIsTarget, 'pushExists', pushExists);
                //logger.debug('inject', 'registerPushProxyobject()', newPush);
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
        if (!pb) { return; }

        /**
         * @listens window:Event#message
         */
        pb.ws.socket.addEventListener('message', (ev) => {
            let message;

            try {
                message = JSON.parse(ev.data);
            } catch (error) {
                logger.error('inject', 'pb.ws.socket:message', error.message);
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
                        logger.error('inject', 'pb.ws.socket:message', error.message);
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
            }

            logger.debug('inject', 'pb.ws.socket:message', 'message.push.type', message.push.type);
        });
        clearInterval(pollingInterval);
    }, defaultInterval, this);
};

/**
 * Init
 */
let init = () => {
    logger.debug('inject', 'init()');

    isOnline({ hostnames: [ 'www.pushbullet.com' ] }).then(online => {
        logger.debug('inject', 'init()', 'isOnline');

        registerNavigationOptimizations();
        registerErrorProxyobject();
        registerPushProxyobject();
        registerWebsocketListeners();

        applyInterfaceOptimizations();

        if (isDebug) { pb.DEBUG = true; }
        if (pb.error && pb.error.type) { pb.error.clear(); }
        if (settings.getConfigurationItem('replayOnLaunch').get()) { pbPush.enqueueRecentPushes(); }
    });
};


/** @listens window#resize */
window.addEventListener('resize', () => {
    logger.debug('inject', 'window#resize');

    applyInterfaceOptimizations();
});

/** @listens window#on */
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


/** @listens window#onload */
window.addEventListener('load', () => {
    logger.debug('device', 'window:load');

    let pollingInterval = setInterval(function() {
        if (!window.pb || !window.pb.account) { return; }

        pb = window.pb;
        onecup = window.onecup;

        init();

        clearInterval(pollingInterval);
    }, defaultInterval, this);
});
