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
let defaultPollingInterval = 1000;


/**
 * Remove setup menu item
 */
let registerInterfaceOptimizations = () => {
    let pollingInterval = setInterval(() => {
        if (!window.pb) { return; }

        // Hide setup wizard
        window.pb.api.account.preferences.setup_done = true;
        window.pb.sidebar.update();

        // Set initial view
        window.onecup['goto']('/#people');

        // Optimize header layout
        let header = document.getElementById('mobile-header') || document.getElementById('header');
        header.style.boxShadow = 'none';

        clearInterval(pollingInterval);
    }, defaultPollingInterval, this);
};

/**
 * Proxy pb.ws
 */
let registerErrorProxyobject = () => {
    let pollingInterval = setInterval(function() {
        if (!window.pb) { return; }
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
let registerPushProxyobject = () => {
    let pollingInterval = setInterval(function() {
        if (!window.pb) { return; }

        window.pb.api.pushes.objs = new Proxy(window.pb.api.pushes.objs, {
            set: (pushesObj, iden, newPush) => {
                // Check if push object exists
                if (iden in pushesObj) { return false; }

                // Check if push with iden exists
                let pushExists = Boolean(window.pb.api.pushes.all.filter(function(push) { return push.iden === newPush.iden; }).length);
                if (pushExists) { return false; }

                // Check if push is targeted to specific device id
                let appIsTarget = true;
                let devicesObjs = window.pb.api.devices.objs;
                let targetIden = newPush.target_device_iden;
                if (targetIden && devicesObjs[targetIden]) {
                    if (devicesObjs[targetIden].model && (devicesObjs[targetIden].model !== 'pb-for-desktop')) {
                        appIsTarget = false;
                    }
                }

                if (appIsTarget) { pbPush.enqueuePush(newPush); }

                pushesObj[iden] = newPush;

                // DEBUG
                logger.debug('inject', 'proxy', 'iden', iden, 'appIsTarget', appIsTarget, 'pushExists', pushExists);
            }
        });

        clearInterval(pollingInterval);
    }, defaultPollingInterval, this);
};

/**
 * Listen for Pushbullet Stream
 */
let registerWebsocketListeners = () => {
    let pollingInterval = setInterval(function() {
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
    }, defaultPollingInterval, this);
};


/**
 * Add native context menus
 * @listens window:PointerEvent#contextmenu
 */
window.addEventListener('contextmenu', (ev) => {
    if (!ev.target['closest']('textarea, input, [contenteditable="true"]')) { return; }

    let menu = editorContextMenu();

    let menuTimeout = setTimeout(function() {
        menu.popup(remote.getCurrentWindow());
        return clearTimeout(menuTimeout);
    }, 60);
});


/**
 * Initialize
 */
let initialize = () => {
    /**
     * @listens connectivityService#online
     */
    connectivityService.once('online', () => {
        registerInterfaceOptimizations();
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

        // DEBUG
        logger.debug('window:load', 'reachable', connectivityService.online);
    });
};


/**
 * @listens window:Event#load
 */
window.addEventListener('load', () => {
    initialize();
});
