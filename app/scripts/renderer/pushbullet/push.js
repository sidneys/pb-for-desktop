'use strict'


/**
 * Modules
 * Node
 * @constant
 */
const os = require('os')
const path = require('path')
const url = require('url')

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron')
const { remote } = electron

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash')
const appRootPath = require('app-root-path')['path']
const dataUriToBuffer = require('data-uri-to-buffer')
const fileType = require('file-type')
const fileUrl = require('file-url')
const getYouTubeID = require('get-youtube-id')
const icojs = require('icojs')
const imageDownloader = require('image-downloader')
const isDebug = require('@sidneys/is-env')('debug')
const jimp = require('jimp')
const logger = require('@sidneys/logger')({ write: true })
const moment = require('moment')
const notificationProvider = remote.require('@sidneys/electron-notification-provider')
const opn = require('opn')
const shortid = require('shortid')

/**
 * Modules
 * Internal
 * @constant
 */
const configurationManager = remote.require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'))
const pbSms = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'pushbullet', 'sms'))


/**
 * Application
 * @constant
 * @default
 */
const appName = remote.getGlobal('manifest').name
const appTemporaryDirectory = (isDebug && process.defaultApp) ? appRootPath : os.tmpdir()


/** @namespace Audio */
/** @namespace pb.api.accounts */
/** @namespace pb.api.grants */
/** @namespace pb.api.pushes */
/** @namespace pb.api.pushes.dismiss */
/** @namespace pb.sms */
/** @namespace push.application_name */
/** @namespace push.dismissed */
/** @namespace push.file_name */
/** @namespace push.file_url */
/** @namespace push.image_url */
/** @namespace push.notifications */


/**
 * Urls
 * @constant
 */
const besticonEndpointUrl = 'pb-for-desktop-besticon.herokuapp.com'
const pushbulletUrl = 'www.pushbullet.com'
const youtubeUrl = 'img.youtube.com'

/**
 * Notifications
 * @constant
 * @default
 */
const notificationInterval = 2000
const maxRecentNotifications = 5
const faviconImageSize = 120
const notificationImageSize = 88


/**
 * Retrieve PushbulletLastNotificationTimestamp
 * @return {Number} - timestamp
 */
let retrievePushbulletLastNotificationTimestamp = () => configurationManager('pushbulletLastNotificationTimestamp').get()

/**
 * Store PushbulletLastNotificationTimestamp
 * @param {Number} timestamp - Timestamp
 * @return {undefined}
 */
let storePushbulletLastNotificationTimestamp = (timestamp) => configurationManager('pushbulletLastNotificationTimestamp').set(timestamp)

/**
 * Retrieve ShowAppBadgeCount
 * @return {Boolean} - Show
 */
let retrieveAppShowBadgeCount = () => configurationManager('appShowBadgeCount').get()

/**
 * Retrieve PushbulletHideNotificationBody
 * @return {Boolean} - Hide
 */
let retrievePushbulletHideNotificationBody = () => configurationManager('pushbulletHideNotificationBody').get()

/**
 * Retrieve PushbulletSoundEnabled
 * @return {Boolean} - Enabled
 */
let retrievePushbulletSoundEnabled = () => configurationManager('pushbulletSoundEnabled').get()

/**
 * Retrieve PushbulletSmsEnabled
 * @return {Boolean} - Enabled
 */
let retrievePushbulletSmsEnabled = () => configurationManager('pushbulletSmsEnabled').get()

/**
 * Retrieve PushbulletSoundFile
 * @return {String} - Path
 */
let retrievePushbulletSoundFile = () => configurationManager('pushbulletSoundFile').get()

/**
 * Retrieve AppSoundVolume
 * @return {Number} - Volume
 */
let retrievePushbulletSoundVolume = () => configurationManager('pushbulletSoundVolume').get()


/**
 * @instance
 */
let lastNotificationTimestamp
let appSoundVolume

/**
 * Set application badge count
 * @param {Number} total - Number to set
 *
 */
let updateBadge = (total) => {
    logger.debug('updateBadge')

    if (Boolean(retrieveAppShowBadgeCount()) === false) {
        return
    }

    remote.app.setBadgeCount(total)
}

/**
 * Play Sound
 * @param {String} file - Path to WAV audio
 * @param {Function=} callback  - Callback
 *
 */
let playSound = (file, callback = () => {}) => {
    logger.debug('playSound')

    let url = fileUrl(file)
    let AudioElement = new Audio(url)

    AudioElement.volume = appSoundVolume

    /**
     * @listens audio:MediaEvent#error
     */
    AudioElement.addEventListener('error', (error) => {
        logger.error('playSound', error)
        callback(error)
    })

    AudioElement.play().then(() => {
        logger.debug('playSound', url)
        callback(null)
    })
}

/**
 * Find images for Pushbullet push
 * @param {Object} push - Push Object
 * @returns {String} Image URI
 */
let generateImageUrl = (push) => {
    logger.debug('generateImageUrl')

    const pb = window.pb

    let iconUrl

    /**
     * Account icon
     */
    let iconAccount
    const accountIdShort = push['receiver_iden']

    for (let account of pb.api.accounts.all) {
        if (account['iden'].startsWith(accountIdShort)) {
            iconAccount = account['image_url']
        }
    }

    /**
     * Channel icon
     */
    let iconChannel
    const channelId = push['client_iden']

    for (let channel of pb.api.grants.all) {
        if (channel['client']['iden'] === channelId) {
            iconChannel = channel['client']['image_url']
        }
    }

    /**
     * Device icon
     */
    let iconDevice
    const deviceId = push['source_device_iden']

    for (let device of pb.api.devices.all) {
        if (device['iden'] === deviceId) {
            iconDevice = `http://${pushbulletUrl}/img/deviceicons/${device.icon}.png`
        }
    }

    /**
     * SMS icon
     */
    if (push['type'] === 'sms_changed') {
        iconDevice = `http://${pushbulletUrl}/img/deviceicons/phone.png`
    }

    /**
     * Mirror icon
     */
    let iconMirror

    if (push['type'] === 'mirror') {
        iconMirror = `data:image/jpeg;base64,${push.icon}`
    }

    /**
     * Website icon
     */
    let iconWebsite

    if (push['type'] === 'link') {
        // YouTube
        if (getYouTubeID(push['url'])) {
            iconWebsite = `http://${youtubeUrl}/vi/${getYouTubeID(push['url'])}/hqdefault.jpg`
        } else {
            iconWebsite
                = `https://${besticonEndpointUrl}/icon?fallback_icon_color=4AB367&formats=ico,png&size=1..${faviconImageSize}..200&url=${push['url']}`
        }
    }

    // Fallback
    iconUrl = iconWebsite || iconMirror || iconChannel || iconDevice || iconAccount

    return iconUrl
}

/**
 * Dismiss Pushbullet push
 * @param {Object} push - Push Object
 *
 */
let dismissPushbulletPush = (push) => {
    logger.debug('dismissPushbulletPush')

    const pb = window.pb

    // direction: self
    if (push.direction === 'self') {
        if (!push.dismissed && !push.target_device_iden) {
            logger.debug('dismissPushbulletPush', 'self', 'push.title:', push.title)
            pb.api.pushes.dismiss(push)
        }
    }

    // direction: incoming
    if (push.direction === 'incoming') {
        if (!push.dismissed) {
            logger.debug('dismissPushbulletPush', 'incoming', 'push.title:', push.title)
            pb.api.pushes.dismiss(push)
        }
    }
}

/**
 * Parse strings, look for strings in tags (see https://goo.gl/ijKFPd)
 * @see https://goo.gl/ijKFPd
 * @param {String} message - Message String
 * @returns {Object} - Message Object
 */
let parsePush = (message) => {
    logger.debug('parsePush', message)

    // default
    let body = message
    let subtitle = message
    let title = message

    // characters for tag detection
    const tagStart = '['
    const tagEnd = ']'


    let tagList = title.match(new RegExp(`\\${tagStart}(.*?)\\${tagEnd}`, 'gi')) || []
    let titleList = title.match(new RegExp(`${tagStart}^${tagStart}\\${tagEnd}${tagEnd}+(?=${tagEnd})`, 'gi')) || []

    if (titleList.length > 0) {
        /** body */
        // remove all tags
        tagList.forEach((tag) => {
            body = body.replace(tag, '')
        })

        /** title */
        if (titleList.length > 1) {
            subtitle = _.startCase(_.toLower(titleList[0]))

            titleList.shift()
            title = titleList.join(` | `)
        }
    }

    return {
        body: body,
        subtitle: subtitle,
        title: title
    }
}

/**
 * Decorate Push objects
 * @param {Object} push - Push Object
 * @returns {Object} - Push Object
 */
let decoratePushbulletPush = (push) => {
    logger.debug('decoratePushbulletPush', push.type)
    //logger.debug('decoratePushbulletPush', 'undecorated:', push);

    switch (push.type) {
        // Link
        case 'link':
            push.url = push['url']
            push.icon = generateImageUrl(push)

            if (!push.body && !push.title) {
                push.title = push.url
            }

            if (!push.body && push.title) {
                let parsed = parsePush(push.title)

                push.body = parsed.body
                push.subtitle = parsed.subtitle
                push.title = parsed.title
            }

            break
        // Note
        case 'note':
            push.title = push.title || push.body
            push.body = push.body || push.title
            push.icon = generateImageUrl(push)
            //push.title = `Note | ${push.title}`;

            break
        // File
        case 'file':
            push.title = push.title || push.file_name
            push.body = push.body || push.title
            push.url = push.file_url
            push.icon = push.image_url || generateImageUrl(push)
            //push.title = `File | ${push.title}`;

            break
        // Mirror
        case 'mirror':
            if (push.application_name && push.title) {
                push.title = `${push.application_name} | ${push.title}`
            } else if (push.application_name && !push.title) {
                push.title = push.application_name
            }

            push.body = push.body || push.title
            push.url = push.file_url
            push.icon = push.image_url || generateImageUrl(push)

            break
        // SMS
        case 'sms_changed':
            if (push.notifications.length !== 0) {
                let sms = push.notifications[0]
                let phonenumber = sms.title
                let text = sms.body
                let time = (new Date(0)).setUTCSeconds(sms.timestamp)

                push.title = `SMS | ${phonenumber}`
                push.body = `${text}${os.EOL}${moment(time).fromNow()}`
                push.icon = push.image_url || generateImageUrl(push)
            }
            break
    }

    // Detect URLs in title
    let detectedUrl = (push.title && push.title.match(/\bhttps?:\/\/\S+/gi)) || []
    if (!push.url && detectedUrl.length > 0) {
        push.url = detectedUrl[0]
    }

    // Trim
    push.title = push.title && push.title.trim()
    push.body = push.body && push.body.trim()

    //logger.debug('decoratePushbulletPush', 'decorated:', push);

    return push
}

/**
 * Show Notification
 * @param {Object} notificationOptions - NotificationConfiguration
 * @param {Object=} pushObject - Pushbullet Push
 */
let renderNotification = (notificationOptions, pushObject) => {
    logger.debug('renderNotification')

    /**
     * Create notification
     */
    const notification = notificationProvider.create(notificationOptions)

    /**
     * @listens notification:PointerEvent#click
     */
    notification.on('click', () => {
        logger.debug('notification#click')

        // Open url
        if (notificationOptions.url) {
            opn(notificationOptions.url, { wait: false })
        }

        // Dismiss within API
        if (pushObject) {
            dismissPushbulletPush(pushObject)
        }
    })

    /**
     * @listens notification:PointerEvent#close
     */
    notification.on('close', () => {
        logger.debug('notification#close')
    })

    /**
     * @listens notification:PointerEvent#reply
     */
    notification.on('reply', (event, reply) => {
        logger.debug('notification#reply')

        pbSms.sendReply(reply, (error) => {
            if (error) {
                logger.error('notification#reply', error)
            }
        })
    })

    /**
     * @listens notification:PointerEvent#error
     */
    notification.on('error', (error) => {
        logger.error('notification#error', error)
    })

    /**
     * @listens notification:PointerEvent#show
     */
    notification.on('show', (event) => {
        logger.debug('notification#show', event)
    })


    /**
     * Show notification
     */
    notification.show()


    /**
     * Play sound
     */
    if (retrievePushbulletSoundEnabled()) {
        playSound(retrievePushbulletSoundFile())
    }
}

/**
 * Write & resize image
 * @param {ArrayBuffer|Array|*} source - Source image
 * @param {String} target - Target file
 * @param {Function=} callback - Callback
 */
let writeResizeImage = (source, target, callback = () => {}) => {
    logger.debug('writeResizeImage')

    jimp.read(source, (error, result) => {
        if (error) {
            logger.error('writeResizeImage', 'jimp.read', error)
            callback(error)
            return
        }

        result.resize(notificationImageSize, jimp.AUTO).write(target, (error) => {
            if (error) {
                logger.error('writeResizeImage', 'result.resize', error)
                callback(error)
                return
            }

            callback(null, target)
        })
    }).then((result) => {
        logger.debug('writeResizeImage', 'result', result)
    })
}

/**
 * Create Notification from Push Objects
 * @param {Object} push - Push Object
 */
let convertPushToNotification = (push) => {
    logger.debug('convertPushToNotification')

    /**
     * Decorate Push object
     */
    push = decoratePushbulletPush(push)

    /**
     * Create Options
     */
    const notificationOptions = {
        body: push.body,
        icon: push.icon,
        subtitle: push.subtitle,
        tag: push.iden,
        title: push.title,
        url: push.url
    }

    /**
     * Body
     */
    const hideNotificationBody = retrievePushbulletHideNotificationBody()
    if (hideNotificationBody) {
        notificationOptions.body = void 0
    }

    /**
     * Reply
     */
    if (push.type === 'sms_changed') {
        notificationOptions.hasReply = true
        notificationOptions.replyPlaceholder = 'Your SMS Reply'
    }

    /**
     * Fetch Favicon
     */
    const imageUrl = notificationOptions.icon || ''
    const imageProtocol = url.parse(imageUrl).protocol
    const imageFilepathTemporary = path.join(appTemporaryDirectory, `${appName}.push.${shortid.generate()}.png`)

    /**
     * Image: None
     */
    if (!imageProtocol) {
        renderNotification(notificationOptions, push)

        return
    }

    /**
     * Image: From DataURI
     */
    if (imageProtocol === 'data:') {
        writeResizeImage(dataUriToBuffer(imageUrl), imageFilepathTemporary, (error, imageFilepathConverted) => {
            if (error) {
                return
            }

            notificationOptions.icon = imageFilepathConverted
            renderNotification(notificationOptions, push)
        })

        return
    }

    /**
     * Image: From URI
     */
    imageDownloader.image({ url: imageUrl, dest: imageFilepathTemporary })
                   .then((result) => {
                       const imageFilepathDownloaded = result.filename
                       const imageBuffer = result.image
                       const imageType = fileType(imageBuffer)
                       const isIco = icojs.isICO(imageBuffer)
                       const isPng = imageType.mime === 'image/png'
                       const isJpeg = imageType.mime === 'image/jpg' || imageType.mime === 'image/jpeg'

                       logger.debug('convertPushToNotification', 'imageDownloader', 'imageUrl:', imageUrl, 'imageFilepathDownloaded:', imageFilepathDownloaded, 'imageType:', imageType)

                       /**
                        * .PNG
                        */
                       if (isPng || isJpeg) {
                           writeResizeImage(imageBuffer, imageFilepathDownloaded, (error, imageFilepathConverted) => {
                               if (error) {
                                   return
                               }

                               notificationOptions.icon = imageFilepathConverted
                               renderNotification(notificationOptions, push)
                           })

                           return
                       }

                       /**
                        * .ICO -> .PNG
                        */
                       if (isIco) {
                           icojs.parse(imageBuffer, 'image/png').then(imageList => {
                               const imageMaximum = imageList[imageList.length - 1]
                               writeResizeImage(Buffer.from(imageMaximum.buffer), imageFilepathDownloaded, (error, imageFilepathConverted) => {
                                   if (error) {
                                       return
                                   }

                                   notificationOptions.icon = imageFilepathConverted
                                   renderNotification(notificationOptions, push)
                               })
                           })
                       }

                   })
                   /**
                    * Image Downloader failed: Fallback to AppIcon
                    */
                   .catch((error) => {
                       logger.warn('convertPushToNotification', 'imageDownloader', error)

                       renderNotification(notificationOptions, push)
                   })
}

/**
 * Test if a notification should be shown for this push
 * @param {Object} push - Push Object
 * @returns {Boolean|void}
 */
let shouldShowPush = (push) => {
    //logger.debug('shouldShowPush');

    // Activity
    if (push.hasOwnProperty('active')) {
        // Push is not active
        if (Boolean(push.active) === false) {
            // logger.debug('shouldShowPush', false, 'push is not active');
            return false
        }
    }

    // Direction
    if (push.direction === 'self') {
        // Don't show if Push was dismissed
        if (Boolean(push.dismissed) === true) {
            // logger.debug('shouldShowPush', false, 'push was dismissed already');
            return false
        }
    }

    // SMS
    if (push.type === 'sms_changed') {
        // Don't show if SMS is disabled
        const pushbulletSmsEnabled = retrievePushbulletSmsEnabled()
        if (!pushbulletSmsEnabled) {
            // logger.debug('shouldShowPush', false, 'sms mirroring is not enabled');
            return false
        }
        // Don't show if SMS has no attached notifications
        if (push.notifications.length === 0) {
            // logger.debug('shouldShowPush', false, 'sms push is empty');
            return false
        }
    }

    // logger.debug('shouldShowPush:', true, 'type:', push.type);

    return true
}

/**
 * Show Pushbullet push
 * @param {Object} push - Push Object
 */
let showPush = (push) => {
    //logger.debug('showPush');

    // Test if in snooze mode
    const isSnoozing = (Date.now() < remote.getGlobal('snoozeUntil'))

    if (!isSnoozing && shouldShowPush(push)) {
        convertPushToNotification(push)
    }
}

/**
 * Get all Pushbullet Pushes sorted by recency (ascending)
 * @param {Number=} queueLimit - Limit result to fixed number
 * @returns {Array|undefined} List of Pushes
 */
let getRecentPushesList = (queueLimit = 0) => {
    logger.debug('fetchRecentPushes')

    const pb = window.pb

    let recentPushesList = []

    // Build list of recent active pushes
    for (let iden in pb.api.pushes.objs) {
        if (pb.api.pushes.objs.hasOwnProperty(iden)) {
            if (shouldShowPush(pb.api.pushes.objs[iden])) {
                recentPushesList.push(pb.api.pushes.objs[iden])
            }
        }
    }

    // Sort recent pushes by date created
    recentPushesList.sort((pushA, pushB) => {
        const dateA = pushA.created
        const dateB = pushB.created

        if (dateA < dateB) {
            return -1
        } else if (dateA > dateB) {
            return 1
        }
        return 0
    })

    // Apply size limit to recent pushes
    recentPushesList = recentPushesList.slice(recentPushesList.length - queueLimit, recentPushesList.length)

    return recentPushesList
}

/**
 * Enqueue 1 + N Pushes
 * @param {Array|Object} pushes - Pushbullet push objects
 * @param {Boolean} ignoreDate - Ignore time of push, always show
 * @param {Boolean} updateBadgeCount - Update badge counter
 * @param {Function=} callback - Callback
 */
let enqueuePush = (pushes, ignoreDate = false, updateBadgeCount = true, callback = () => {}) => {
    logger.debug('enqueuePush')

    pushes = _.isArray(pushes) ? pushes : [pushes]

    if (pushes.length === 0) {
        logger.warn('enqueuePush', 'pushes list was empty')
        callback(null, 0)
        return
    }

    let nextPushesList = pushes
    let notifyAfter = lastNotificationTimestamp || 0

    // Remove pushes older than 'lastNotification' from array
    if (Boolean(ignoreDate) === false) {
        nextPushesList = pushes.filter((element) => {
            return (element.created) > notifyAfter
        })
    }

    nextPushesList.forEach((push, pushIndex) => {
        //logger.debug('enqueuePush', 'push:', push);

        let timeout = setTimeout(() => {

            // Show local notification
            showPush(push)

            // Update saved lastNotification
            if (push.created > notifyAfter) {
                lastNotificationTimestamp = push.created
                storePushbulletLastNotificationTimestamp(push.created)
            }

            // Last push triggered
            if (nextPushesList.length === (pushIndex + 1)) {
                if (updateBadgeCount) {
                    updateBadge(remote.app.getBadgeCount() + nextPushesList.length)
                }

                callback(null, nextPushesList.length)

                clearTimeout(timeout)
            }
        }, (Math.round(notificationInterval) * (pushIndex + 1)))
    })
}

/**
 * Get all new pushes and show them (if any)
 * @param {Function=} callback - Callback
 * @public
 */
let enqueueRecentPushes = (callback = () => {}) => {
    logger.debug('enqueueRecentPushes')

    const pushesList = getRecentPushesList(maxRecentNotifications)

    enqueuePush(pushesList, true, false, (error, count) => {
        if (error) {
            logger.error('enqueueRecentPushes', error)
            callback(error)
            return
        }

        callback(null, count)
    })
}

/**
 * Init
 */
let init = () => {
    logger.debug('init')

    lastNotificationTimestamp = retrievePushbulletLastNotificationTimestamp()
    appSoundVolume = retrievePushbulletSoundVolume()
}


/**
 * @listens window:UIEvent#load
 */
window.addEventListener('load', () => {
    logger.debug('window#load')

    init()
})


/**
 * @exports
 */
module.exports = {
    enqueuePush: enqueuePush,
    enqueueRecentPushes: enqueueRecentPushes,
    updateBadge: updateBadge
}
