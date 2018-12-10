'use strict'


/**
 * Modules
 * External
 * @constant
 */
const logger = require('@sidneys/logger')({ write: true })


/**
 * Get First SMS Device Id
 * @returns {String} - Device Id
 */
let getFirstSmsDeviceId = () => window.pb.api.sms.first_sms_device().iden

/**
 * Get Last SMS Device Id
 * @returns {String} - Device Id
 */
let getLastSmsDeviceId = () => window.pb.db.get('last_sms_device_iden')

/**
 * Get Thread Id for SMS Message
 * @param {Pushbullet.Push|Pushbullet.SmsChangeEphemeral} push - Push
 * @returns {String} - Thread Id
 */
let getMessageThreadId = (push) => push.notifications[0].thread_id


/**
 * Parse Ephemeral
 * @param {Pushbullet.BaseEphemeral} message - Message
 * @returns {Object} - Parsed Message
 */
let decodeEphemeral = (message) => {
    let parsed = {}

    if (message.encrypted) {
        try {
            parsed = JSON.parse(window.pb.e2e.decrypt(message.ciphertext))
            logger.debug('E2E Decryption successful')
        } catch (error) {
            logger.error('E2E Decryption failed', error)
        }
    } else {
        parsed = message
    }

    return parsed
}

/**
 * Send SMS reply
 * @param {String} message - Message
 * @param {String} deviceId - Target Device Id
 * @param {String} threadId - Thread Id
 * @param {function=} callback - Callback
 * @return {void}
 * @public
 */
let reply = (message, deviceId, threadId, callback = () => {}) => {
    logger.debug('reply')

    // Refresh SMS Messages
    window.pb.api.pinger.ping_all()

    // Refresh SMS Targets
    if (!window.pb.sms.target) {
        window.pb.sms.target = window.pb.targets.by_device_iden(getLastSmsDeviceId() || getFirstSmsDeviceId())
        window.pb.sms.picker.target = window.pb.sms.target
    }

    // Refresh SMS Devices
    window.pb.api.sms.fetch_device()

    // Fetch Device SMS Message Threads
    window.pb.net.get(`/v2/permanents/${window.pb.sms.target.obj.iden}_threads`, {}, (data) => {
        logger.debug('reply', `/v2/permanents/${window.pb.sms.target.obj.iden}_threads`)

        data = decodeEphemeral(data)
        const threads = data.threads || []

        // Lookup Thread of SMS Message
        const thread = threads.find(thread => thread.id === threadId)
        const addressList = thread.recipients.map(recipient => recipient.address)

        // Schedule UI Update
        setTimeout(window.onecup.refresh, window.pb.sms.message_time_out + 1000)

        // Create Push
        const push = {
            target: window.pb.targets.by_device_iden(deviceId),
            addresses: addressList,
            ghost: true,
            timestamp: Date.now() / 1000,
            direction: 'outgoing',
            body: message,
            guid: window.pb.rand_iden(),
            thread_id: threadId
        }

        // Dispatch Text Push
        window.pb.api.texts.send(push.target.obj, push.addresses, push.body, push.guid, push.thread_id)

        // Enqueue SMS Push
        window.pb.sms.q.push(push)

        // Callback
        callback(push.addresses)
    })
}


/**
 * @exports
 */
module.exports = {
    getMessageThreadId: getMessageThreadId,
    reply: reply
}
