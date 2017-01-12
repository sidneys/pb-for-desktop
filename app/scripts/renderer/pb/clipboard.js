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
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });


/**
 * Pushbullet
 * Globals
 * @global
 */
let pb;
let defaultInterval = 1000;



/**
 * Get 'pb-for-desktop' device
 * @return {Array} Devices with model = 'pb-for-desktop'
 */
let getDevice = () => {
    return pb.api.devices.all.filter((device) => {
        return (device.model === 'pb-for-desktop');
    })[0];
};

/**
 * Receive Clipboard
 * @param {Object} clip
 */
let receiveClip = function(clip) {
    pb.lastClip = clipboard.readText();

    clipboard.writeText(clip.body);
};

let publishClip = function(clip) {
    let data = {
        'type': 'clip',
        'source_user_iden': pb.account.iden,
        'source_device_iden': getDevice().iden,
        'body': clip
    };

    let push;
    if (pb.e2e.enabled) {
        push = {
            'encrypted': true,
            'ciphertext': pb.e2e.encrypt(JSON.stringify(data))
        };
    } else {
        push = data;
    }

    pb.net.post('/v2/ephemerals', {
        'type': 'push',
        'push': push
    }, function(result) {
        // Error
        if (!result) {
            logger.devtools('clipboard', 'publish failed');
            return;
        }

        // Error: Pushbullet Pro
        if (result.error) {
            logger.devtools('clipboard', 'publish error', result.error.message);
            return;
        }

        // OK
        logger.devtools('clipboard', 'publish');
    });
};


let clipboardWatcher = () => {
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
let initializeClipboard = function() {
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

    /**
     * Publisher
     * @listens window:Event#message
     */
    clipboardWatcher();
};


/**
 * @listens window:Event#load
 */
window.addEventListener('load', () => {
    let pollingInterval = setInterval(function() {
        if (!window.pb) {
            return;
        }

        pb = window.pb;

        initializeClipboard();

        clearInterval(pollingInterval);
    }, defaultInterval, this);
});
