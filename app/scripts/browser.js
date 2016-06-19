'use strict';

/**
 * Modules
 * External
 */
const { ipcRenderer }  = require('electron'),
    remote = require('electron').remote,
    buildEditorContextMenu = remote.require('electron-editor-context-menu'),
    path = require('path'),
    _ = require('lodash');


/**
 * Notification Reference
 */
let OriginalNotification = Notification;


/**
 * Logger
 */
let log = function() {
    var args = Array.from(arguments),
        textList = [];

    for (let value of args) {
        if (_.isPlainObject(value)) {
            textList.push('\r\n' + JSON.stringify(value, null, 4) + '\r\n');
        } else {
            textList.push(value);
        }
    }
    console.log('[module:' + path.basename(__filename) + ']', textList.join(' '));
};

/**
 * @description Resolves a Pushbullet Push object to an image URL.
 * @param {Object} push - Pushbullet Push object (see https://docs.pushbullet.com/#push)
 * @returns {String}
 */
var getIconForPushbulletPush = function(push) {

    var imageUrl;

    // Account image
    var accountImage,
        accountIdShort = push['receiver_iden'],
        accountList = window.pb.api.accounts.all;

    for (var account of accountList) {
        if (account['iden'].startsWith(accountIdShort)) {
            log('account', account);
            accountImage = account['image_url'];
        }
    }

    // Channel image (i.e. IFTTT, Zapier)
    var channelImage,
        channelId = push['client_iden'],
        channelList = window.pb.api.grants.all;

    for (var channel of channelList) {
        if (channel['client']['iden'] === channelId) {
            log('channel', channel);
            channelImage = channel['client']['image_url'];
        }
    }

    // Device image (i.e. Phone, Browser)
    var deviceImage,
        deviceId = push['source_device_iden'],
        deviceList = window.pb.api.devices.all;

    for (var device of deviceList) {
        if (device['iden'] === deviceId) {
            deviceImage = 'http://www.pushbullet.com/img/deviceicons/' + device['icon'] + '.png';
        }
    }

    // Fallback behaviour
    imageUrl = channelImage || deviceImage || accountImage;

    return imageUrl;
};


Notification = function(pushTitle, push) {

    /**
     * @constant
     * @default
     */
    var DEFAULT_TITLE = null;
    var DEFAULT_BODY = null;
    var DEFAULT_URL = null;
    var DEFAULT_ICON = null;

    // Populate fields for Pushbullet push types (note, link, file)
    var type = push['type'],
        title = push['title'] || push['body'] || DEFAULT_TITLE,
        body = push['body'] || push['title'] || DEFAULT_BODY,
        url = DEFAULT_URL,
        icon = getIconForPushbulletPush(push) || DEFAULT_ICON,
        iden = push['iden'];

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
            body = body || push['file_type'];
            url = push['file_url'];
            icon = push['image_url'] || icon;
            break;
    }

    // Options for native notification
    var options = {
        title: title,
        body: body,
        icon: icon,
        url: url,
        tag: iden
    };


    // Trigger native notification
    var notification = new OriginalNotification(options.title, options);

    // Register event handlers for main renderer
    ipcRenderer.send('notification-received');

    notification.addEventListener('click', () => {
        ipcRenderer.send('notification-click', options);
    });

    return notification;
};

Notification.prototype = OriginalNotification.prototype;
Notification.permission = OriginalNotification.permission;
Notification.requestPermission = OriginalNotification.requestPermission.bind(Notification);

/**
 * Pushbullet API
 * @external window.pb
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String|String}
 */

/**
 * Requests updated Push messages by jerry-rigging into Pushbullet's web app API instance (window.pb.api).
 * Keeps reference to the current state by locally storing the most current Push objects 'modified' parameter.
 * @see {@link https://docs.pushbullet.com/#list-pushes}     {@link https://docs.pushbullet.com/#list-pushes|Pushbullet API}
 * @see Pushbullet API
 */
window.requestPushbulletPushes = function() {

    log('Requesting Pushes after: ', window.settings.notifyAfter);

    var notifyAfter = window.settings.notifyAfter;

    window.pb.net.get('/v2/pushes', {
        modified_after: notifyAfter
    }, function(result) {
        var newPushes = result.pushes,
            lastPush = newPushes[0];

        log('Newest Push', JSON.stringify(lastPush, null, 3));

        if (newPushes.length === 0) {
            log('Nothing to do.');
            return true;
        }

        window.settings.notifyAfter = notifyAfter = lastPush.modified;

        ipcRenderer.send('settings-set', 'notifyAfter', notifyAfter);

        newPushes.forEach(function(push) {
            if (push.active === true) {
                window.setTimeout(function() {
                    return new Notification(null, push);
                }, 500, this);
            }
        });
        log('Updated notifyAfter', window.settings.notifyAfter);
    });
};

/**
 * Extend the Pushbullet WebSocket onmessage handler, injecting our request logic {@link requestPushbulletPushes}.
 * This enables us to hook into all API-related content update events in real time.
 */
window.extendSocketMessageHandler = function() {
    var originalSocketMessageHandler = window.pb.ws.socket.onmessage;

    window.pb.ws.socket.onmessage = function() {
        window.requestPushbulletPushes();
        return originalSocketMessageHandler.apply(originalSocketMessageHandler, arguments);
    };
};

/**
 * Replaces the WebSocket onerror handler.
 * Required in order to prevent overrides of our onmessage handler hook.
 */
window.extendSocketErrorHandler = function() {
    window.pb.ws.socket.onerror = function() {
        setTimeout(function() {
            window.pb.api['listen_for_pushes']();
            window.extendSocketMessageHandler();
        }, 10000);
    };
};

window.settings = {};

/**
 * Inject Pushbullet API hooks on webview page load
 */
window.onload = function() {
    log('[settings-get-reply]');

    var interval = setInterval(function() {
        if (!(window.pb && window.pb.ws.connected)) {
            log('Waiting for Pushbullet Web API Socket connection.');
            return;
        } else {
            log('Pushbullet Web API Socket connection established.');
        }

        clearInterval(interval);
        ipcRenderer.send('settings-get');
        ipcRenderer.on('settings-get-reply', (event, result) => {
            window.settings = result;
            window.extendSocketMessageHandler();
            log('[settings-get-reply]', 'result', result);
        });

    }, 2000, this);
};


/**
 * Enable the native right-click menu in Electron.
 */
window.addEventListener('contextmenu', ev => {
    if (!ev.target.closest('textarea, input, [contenteditable="true"]')) {
        return;
    }

    var menu = buildEditorContextMenu();

    setTimeout(function() {
        menu.popup(remote.getCurrentWindow());
    }, 30);
});
