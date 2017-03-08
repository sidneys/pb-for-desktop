'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const { remote } = require('electron');
const { clipboard } = remote;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });


/**
 * @constant
 * @default
 */
const defaultInterval = 2000;


/**
 * Get "pro" account status
 * @return {Boolean} True if "pro" account
 */
let getAccountProStatus = () => {
    logger.debug('getProStatus');

    const pb = window.pb;

    return Boolean(pb.account.pro);
};

/**
 * Get 'pb-for-desktop' device
 * @return {Array} Devices with model = 'pb-for-desktop'
 */
let getDevice = () => {
    logger.debug('getDevice');

    const pb = window.pb;

    return pb.api.devices.all.filter((device) => {
        return (device.model === 'pb-for-desktop');
    })[0];
};

/**
 * Receive clipboard content
 * @param {Object} clip
 */
let receiveClip = (clip) => {
    logger.debug('receiveClip');

    const pb = window.pb;

    pb.lastClip = clipboard.readText();

    clipboard.writeText(clip.body);
};

/**
 * Publish clipboard content
 * @param {Object} clip
 */
let publishClip = function(clip) {
    logger.debug('publishClip');

    const pb = window.pb;

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
            logger.debug('error');
            return;
        }

        // Error: Pushbullet Pro
        if (result.error) {
            logger.debug('error', result.error.message);
            return;
        }

        // OK
        logger.debug('published');
    });
};

/**
 * Monitor clipboard content
 * @param {Object} clip
 */
let startMonitoring = () => {
    logger.debug('startMonitoring');

    let lastText = clipboard.readText();
    let lastImage = clipboard.readImage();

    let imageHasDiff = (a, b) => {
        return !a.isEmpty() && b.toDataURL() !== a.toDataURL();
    };

    let textHasDiff = (a, b) => {
        return a && b !== a;
    };

    let interval = setInterval(() => {
        const text = clipboard.readText();
        const image = clipboard.readImage();

        if (imageHasDiff(image, lastImage)) {
            lastImage = image;
            publishClip(text);

            // DEBUG
            logger.debug('update image', image);
        }

        if (textHasDiff(text, lastText)) {
            lastText = text;
            publishClip(text);

            // DEBUG
            logger.debug('update text', text);
        }
    }, defaultInterval);
};


/**
 * Init
 */
let init = () => {
    logger.debug('initClipboard');

    const pb = window.pb;
    const account = window.pb.account;

    let interval = setInterval(() => {
        if (!pb || account) { return; }


        if (!getAccountProStatus()) {
            logger.debug('"pro" account not found');

            return;
        }

        /**
         * Receiver
         * @listens window:Event#message
         */
        pb.ws.socket.addEventListener('message', (ev) => {

            let message;

            try {
                message = JSON.parse(ev.data);
            } catch (err) {
                logger.error('addWSMessageHandler', err);
            }

            let messageType = message.type;
            let pushObject = message.push;

            if (pushObject && messageType === 'push') {
                if (pushObject.type && pushObject.type === 'clip') {
                    receiveClip(pushObject);
                }
            }
        });

        startMonitoring();

        clearInterval(interval);
    }, defaultInterval);
};


/**
 * @listens window#load
 */
window.addEventListener('load', () => {
    logger.debug('window#load');

    init();
});
