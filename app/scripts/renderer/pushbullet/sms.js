'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
const logger = require('@sidneys/logger')({ write: true });

/** @namespace onecup.refresh */
/** @namespace pb.api.accounts */
/** @namespace pb.api.pinger.ping_all */
/** @namespace pb.api.pushes */
/** @namespace pb.api.pushes.dismiss */
/** @namespace pb.api.sms.current_thread.id */
/** @namespace pb.api.sms.current_thread.recipients */
/** @namespace pb.api.sms.fetch_device */
/** @namespace pb.api.sms.first_sms_device */
/** @namespace pb.rand_iden */
/** @namespace pb.sms */
/** @namespace pb.sms.message_time_out */
/** @namespace pb.sms.picker.target */
/** @namespace push.application_name */
/** @namespace push.dismissed */
/** @namespace result.ciphertext */
/** @namespace result.threads */


/**
 * Fetch SMS conversation threads
 * @param {function(*)} callback - Callback
 * @private
 */
let fetchSmsThreads = (callback = () => {}) => {
    logger.debug('getSmsThreads');

    const pb = window.pb;

    // Update SMS configuration
    pb.api.pinger.ping_all();
    const firstSmsDeviceIden = pb.api.sms.first_sms_device().iden || pb.db.get('last_sms_device_iden');
    const device = pb.api.devices.objs[firstSmsDeviceIden];

    // Update device configuration
    if (!pb.sms.target) {
        pb.sms.target = pb.targets.make(device);
        pb.sms.picker.target = pb.sms.target;
    }
    pb.api.sms.fetch_device();

    // Fetch latest message threads
    pb.net.get(`/v2/permanents/${pb.sms.target.obj.iden}_threads`, {}, (result) => {
        if (!result) { return callback(new Error('no sms found')); }

        let threads;

        if (result.encrypted) {
            try {
                result = JSON.parse(pb.e2e.decrypt(result.ciphertext));
                threads = result.threads || [];
            } catch (error1) {
                threads = [];
            }
        } else {
            threads = result.threads || [];
        }

        callback(null, threads);
    });
};

/**
 * Send SMS reply
 * @param {String} reply - Reply message
 * @param {function(*)} callback - Callback
 * @return {void}
 * @public
 */
let sendReply = (reply, callback = () => {}) => {
    logger.debug('sendReply');

    const onecup = window.onecup;
    const pb = window.pb;

    if (!Boolean(reply)) {
        callback(new Error('no text provided for sms reply'));
        return;
    }

    // Fetch latest conversations
    fetchSmsThreads((error, threads) => {
        if (error) {
            return callback(error);
        }

        const latestThread = threads[0];

        // Create Reply
        const push = {
            target: pb.sms.target,
            addresses: latestThread.recipients.map(recipient => recipient.address),
            ghost: true,
            timestamp: Date.now() / 1000,
            direction: 'outgoing',
            body: reply,
            guid: pb.rand_iden(),
            thread_id: latestThread.id
        };

        // Schedule UI Update
        let timeout = setTimeout(() => {
            onecup.refresh();

            clearTimeout(timeout);
        }, pb.sms.message_time_out + 1000);

        // Send SMS
        pb.api.texts.send(push.target.obj, push.addresses, push.body, push.guid, push.thread_id);

        callback();
    });
};


/**
 * @exports
 */
module.exports = {
    sendReply: sendReply
};
