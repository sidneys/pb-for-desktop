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
const { clipboard } = remote;

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: false });


/**
 * @global
 * @constant
 */
const defaultInterval = 1000;


/**
 * Get 'pb-for-desktop' device
 * @return {Array} Devices with model = 'pb-for-desktop'
 */
let getDevice = () => {
    logger.debug('clipboard', 'getDevice()');

    return window.pb.api.devices.all.filter((device) => {
        return (device.model === 'pb-for-desktop');
    })[0];
};

/**
 * Receive clipboard content
 * @param {Object} clip
 */
let receiveClip = (clip) => {
    logger.debug('clipboard', 'receiveClip()');

    window.pb.lastClip = clipboard.readText();

    clipboard.writeText(clip.body);
};

/**
 * Publish clipboard content
 * @param {Object} clip
 */
let publishClip = function(clip) {
    logger.debug('clipboard', 'publishClip()');

    let data = {
        'type': 'clip',
        'source_user_iden': window.pb.account.iden,
        'source_device_iden': getDevice().iden,
        'body': clip
    };

    let push;
    if (window.pb.e2e.enabled) {
        push = {
            'encrypted': true,
            'ciphertext': window.pb.e2e.encrypt(JSON.stringify(data))
        };
    } else {
        push = data;
    }

    window.pb.net.post('/v2/ephemerals', {
        'type': 'push',
        'push': push
    }, function(result) {
        // Error
        if (!result) {
            logger.devtools('clipboard', 'error');
            return;
        }

        // Error: Pushbullet Pro
        if (result.error) {
            logger.devtools('clipboard', 'error', result.error.message);
            return;
        }

        // OK
        logger.devtools('clipboard', 'published');
    });
};

/**
 * Monitor clipboard content
 * @param {Object} clip
 */
let monitorClipboard = () => {
    logger.debug('clipboard', 'monitorClipboard()');

    let lastText = clipboard.readText();
    let lastImage = clipboard.readImage();

    let imageHasDiff = (a, b) => {
        return !a.isEmpty() && b.toDataURL() !== a.toDataURL();
    };

    let textHasDiff = (a, b) => {
        return a && b !== a;
    };

    setInterval(() => {
        const text = clipboard.readText();
        const image = clipboard.readImage();

        if (imageHasDiff(image, lastImage)) {
            lastImage = image;
            publishClip(text);

            // DEBUG
            logger.devtools('clipboard', 'update image', image);
        }

        if (textHasDiff(text, lastText)) {
            lastText = text;
            publishClip(text);

            // DEBUG
            logger.devtools('clipboard', 'update text', text);
        }
    }, defaultInterval);
};


/**
 * Init
 */
let initializeClipboard = () => {
    logger.debug('clipboard', 'initializeClipboard()');

    /**
     * Receiver
     * @listens window:Event#message
     */
    window.pb.ws.socket.addEventListener('message', (ev) => {

        let message;

        try {
            message = JSON.parse(ev.data);
        } catch (err) {
            logger.error('clipboard', 'addWSMessageHandler()', err);
        }

        let messageType = message.type,
            pushObject = message.push;

        if (pushObject && messageType === 'push') {
            if (pushObject.type && pushObject.type === 'clip') {
                receiveClip(pushObject);
            }
        }
    });

    monitorClipboard();
};


/** @listens window:Event#load */
window.addEventListener('load', () => {
    logger.debug('clipboard', 'window:load');

    let pollingInterval = setInterval(function() {
        if (!window.pb) {
            return;
        }

        pb = window.pb;

        initializeClipboard();

        clearInterval(pollingInterval);
    }, defaultInterval, this);
});
