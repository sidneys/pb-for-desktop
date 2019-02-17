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
const { remote, ipcRenderer } = electron

/**
 * Modules
 * External
 * @constant
 */
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
const throttledQueue = require('throttled-queue')
const _ = require('lodash')

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


/**
 * Urls
 * @constant
 */
const besticonUrl = 'https://pb-for-desktop-besticon.herokuapp.com'
const pushbulletUrl = 'https://www.pushbullet.com'
const youtubeUrl = 'https://img.youtube.com'

/**
 * Defaults
 * @constant
 * @default
 */
const recentPushesAmount = 5
const besticonIconSize = 120
const notificationInterval = 1000
const notificationImageSize = 88

/**
 * Notifications Queue
 * @global
 */
let queueNotification = throttledQueue(1, notificationInterval, true)


/**
 * Global Settings
 * @global
 */
let lastNotificationTimestamp
let audioElement


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
 // */
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
 * Set application badge count
 * @param {Number} total - Number to set
 */
let updateBadge = (total) => {
    logger.debug('updateBadge')

    if (!retrieveAppShowBadgeCount()) { return }

    remote.app.setBadgeCount(total)
}

/**
 * Play Sound
 */
let playSound = () => {
    logger.debug('playSound')

    // Retrieve State
    const pushbulletSoundEnabled = retrievePushbulletSoundEnabled()

    // Skip if not enabled
    if (!pushbulletSoundEnabled) { return }

    // Retrieve File, Volume
    const pushbulletSoundFile = retrievePushbulletSoundFile()
    const pushbulletSoundVolume = retrievePushbulletSoundVolume()

    // Create File URL
    const url = fileUrl(pushbulletSoundFile)

    // Setup Audio Element
    audioElement = new Audio(url)
    audioElement.volume = pushbulletSoundVolume

    // Errorhandling
    audioElement.onerror = () => {
        logger.error('playSound', url, audioElement.error.message, audioElement.error.code)
    }

    // Play
    audioElement.play().then(() => {
        logger.debug('playSound', url)
    })
}

/**
 * Get Timestamp with Milliseconds
 * @returns {String} - Timestamp
 *
 */
let getTimestamp = () => {
    const date = new Date()
    return `${date.toLocaleTimeString()}.${date.getMilliseconds()}`
}


/**
 * Generate Image for Notification
 * @param {Object} push - Push Object
 * @returns {String} - Image URL
 */
let generateNotificationImage = (push) => {
    logger.debug('generateNotificationImage')

    // Account Image
    let iconAccount
    const accountId = push.receiver_iden

    for (let account of window.pb.api.accounts.all) {
        if (account['iden'].startsWith(accountId)) {
            iconAccount = account.image_url
        }
    }

    // Grant Image
    let iconGrant
    const grantId = push.client_iden

    for (let grant of window.pb.api.grants.all) {
        if (grant['client']['iden'] === grantId) {
            iconGrant = grant['client']['image_url']
        }
    }

    // Device Image
    let iconDevice
    const deviceId = push.source_device_iden

    for (let device of window.pb.api.devices.all) {
        if (device.iden === deviceId) {
            iconDevice = `${pushbulletUrl}/img/deviceicons/${device.icon}.png`
        }
    }

    // SMS Image
    let iconSms

    if (push.type === 'sms_changed') {
        iconSms = `${pushbulletUrl}/img/deviceicons/phone.png`
    }

    // Chat Image
    let iconChat

    if (!!push.sender_email) {
        const target = window.pb.targets.by_email(push.sender_email)
        iconChat = target.image_url
    }

    // Mirroring Image
    let iconMirroring

    if (push.type === 'mirror') {
        iconMirroring = `data:image/jpeg;base64,${push.icon}`
    }

    // Link Image
    let iconLink

    if (push.type === 'link') {
        // Handle YouTube URLs (Thumbnail)
        if (getYouTubeID(push.url)) {
            iconLink = `${youtubeUrl}/vi/${getYouTubeID(push['url'])}/hqdefault.jpg`
        } else {
            // Handle other URLS (Favicon)
            iconLink = `${besticonUrl}/icon?fallback_icon_color=4AB367&formats=ico,png&size=1..${besticonIconSize}..200&url=${push.url}`
        }
    }

    // Image Fallbacks Sequence
    const iconUrl = iconLink || iconMirroring || iconChat || iconGrant || iconDevice || iconSms || iconAccount

    return iconUrl
}

/**
 * Create Note Push
 * @param {String} message - Message
 * @param {String=} email - Target E-Mail
 * @param {String} deviceId - Target Device Id
 * @param {function=} callback - Callback
 */
let createNotePush = (message, email, deviceId, callback = () => {}) => {
    logger.debug('createNotePush')

    window.pb.api.pushes.create({
        type: 'note',
        email: !!deviceId ? void 0 : email,
        device_iden: !!email ? void 0 : deviceId,
        title: message,
        body: message
    })

    // Callback
    callback(email || deviceId)
}

/**
 * Dismiss Push
 * @param {Pushbullet.Push} push - Push Object
 */
let dismissPush = (push) => {
    logger.debug('dismissPush')

    // direction: self
    if (push.direction === 'self') {
        if (!push.dismissed && !push.target_device_iden) {
            logger.debug('dismissPush', 'self', 'push.title:', push.title)
            window.pb.api.pushes.dismiss(push)
        }
    }

    // direction: incoming
    if (push.direction === 'incoming') {
        if (!push.dismissed) {
            logger.debug('dismissPush', 'incoming', 'push.title:', push.title)
            window.pb.api.pushes.dismiss(push)
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

    // Parse Push for Notification Formatting
    // [ Title ] [ Subtitle ] Body Text
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
 * @param {Pushbullet.Push|SmsEphemeral|SmsChangeEphemeral|NotificationEphemeral|DismissalEphemeral|ClipboardEphemeral} push - Pushbullet Push
 * @returns {DecoratedPush} - Push Object
 */
let decoratePush = (push) => {
    logger.debug('decoratePush', push.type)

    // Copy Push Object
    const decoratedPush = Object.assign({}, push)

    switch (decoratedPush.type) {
        // Link
        case 'link':
            decoratedPush.icon = generateNotificationImage(decoratedPush)

            if (!decoratedPush.body && !decoratedPush.title) {
                decoratedPush.title = decoratedPush.url
            }

            if (!decoratedPush.body && decoratedPush.title) {
                let parsed = parsePush(decoratedPush.title)

                decoratedPush.body = parsed.body
                decoratedPush.subtitle = parsed.subtitle
                decoratedPush.title = parsed.title
            }

            break
        // Note
        case 'note':
            decoratedPush.title = decoratedPush.title || decoratedPush.body
            decoratedPush.body = decoratedPush.body || decoratedPush.title
            decoratedPush.icon = generateNotificationImage(decoratedPush)
            //push.title = `Note | ${push.title}`

            break
        // File
        case 'file':
            decoratedPush.title = decoratedPush.title || decoratedPush.file_name
            decoratedPush.body = decoratedPush.body || decoratedPush.title
            decoratedPush.url = decoratedPush.file_url
            decoratedPush.icon = decoratedPush.image_url || generateNotificationImage(decoratedPush)
            //push.title = `File | ${push.title}`

            break
        // Mirror
        case 'mirror':
            if (decoratedPush.application_name && decoratedPush.title) {
                decoratedPush.title = `${decoratedPush.application_name} | ${decoratedPush.title}`
            } else if (decoratedPush.application_name && !decoratedPush.title) {
                decoratedPush.title = decoratedPush.application_name
            }

            decoratedPush.body = decoratedPush.body || decoratedPush.title
            decoratedPush.url = decoratedPush.file_url
            decoratedPush.icon = decoratedPush.image_url || generateNotificationImage(decoratedPush)

            break
        // SMS
        case 'sms_changed':
            if (decoratedPush.notifications.length === 0) { return }

            let sms = decoratedPush.notifications[0]
            let phonenumber = sms.title
            let text = sms.body
            let time = (new Date(0)).setUTCSeconds(sms.timestamp)

            decoratedPush.title = `SMS | ${phonenumber}`
            decoratedPush.body = `${text}${os.EOL}${moment(time).fromNow()}`
            decoratedPush.icon = decoratedPush.image_url || generateNotificationImage(decoratedPush)

            break
    }

    // Detect URLs in title
    let detectedUrl = (decoratedPush.title && decoratedPush.title.match(/\bhttps?:\/\/\S+/gi)) || []
    if (!decoratedPush.url && detectedUrl.length > 0) {
        decoratedPush.url = detectedUrl[0]
    }

    // Trim
    decoratedPush.title = decoratedPush.title && decoratedPush.title.trim()
    decoratedPush.body = decoratedPush.body && decoratedPush.body.trim()

    return decoratedPush
}


/**
 * Show Notification
 * @param {Object} notificationOptions - NotificationConfiguration
 * @param {Pushbullet.Push|Object=} push - Pushbullet Push
 */
let showNotification = (notificationOptions, push) => {
    logger.info('showNotification')

    // Create Notification
    const notification = notificationProvider.create(notificationOptions)

    /** @listens notification#click */
    notification.on('click', () => {
        logger.info('notification#click')

        // Open url
        if (notificationOptions.url) {
            opn(notificationOptions.url, { wait: false })
        }

        // Dismiss within Pushbullet
        if (push) {
            dismissPush(push)
        }
    })

    /** @listens notification#close */
    notification.on('close', () => {
        logger.info('notification#close')

        // Dismiss within Pushbullet
        if (push) {
            dismissPush(push)
        }
    })

    /** @listens notification#reply */
    notification.on('reply', (event, message) => {
        logger.info('notification#reply')

        if (!!!message) {
            logger.warn('reply message was empty')

            return
        }

        // SMS Reply
        if (push.type === 'sms_changed') {
            pbSms.reply(message, push.source_device_iden, pbSms.getMessageThreadId(push), (target) => {
                logger.info('reply message sent', 'to:', target)
            })
        }

        // Chat Reply
        if (push.type === 'note' || push.type === 'link' || push.type === 'file') {
            createNotePush(message, push.sender_email, null, (target) => {
                logger.info('reply message sent', 'to:', target)
            })
        }

    })

    /** @listens notification#error */
    notification.on('error', (error) => {
        logger.error('notification#error', error)
    })

    /** @listens notification#show */
    notification.on('show', (event) => {
        logger.info('notification#show')
    })


    // Queue Throttled Notification
    queueNotification(() => {
        logger.info('Triggering Notification at:', getTimestamp())

        // Show Notification
        notification.show()

        // Play Sound
        playSound()
    })
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
 * @param {Pushbullet.Push|SmsEphemeral|SmsChangeEphemeral|NotificationEphemeral|DismissalEphemeral|ClipboardEphemeral} push - Pushbullet Push
 */
let convertPushToNotification = (push) => {
    logger.debug('convertPushToNotification')

    // Copy Push Object
    const decoratedPush = decoratePush(push)

    // Create Options
    const notificationOptions = {
        body: decoratedPush.body,
        icon: decoratedPush.icon,
        subtitle: decoratedPush.subtitle,
        tag: decoratedPush.iden,
        title: decoratedPush.title,
        url: decoratedPush.url
    }

    // SMS Feature Enabled?
    if (decoratedPush.type === 'sms_changed') {
        const pushbulletSmsEnabled = retrievePushbulletSmsEnabled()
        if (!pushbulletSmsEnabled) { return }
    }

    // Hide Notification Body?
    const pushbulletHideNotificationBody = retrievePushbulletHideNotificationBody()
    if (pushbulletHideNotificationBody) {
        notificationOptions.body = ''
    }

    // Enable SMS Reply?
    if (decoratedPush.type === 'sms_changed') {
        notificationOptions.hasReply = true
        notificationOptions.replyPlaceholder = 'Your SMS Reply'
    }

    // Enable Chat Reply?
    if ((decoratedPush.type === 'note' || decoratedPush.type === 'link' || decoratedPush.type === 'file') && decoratedPush.direction === 'incoming' && !!decoratedPush.sender_email) {
        notificationOptions.hasReply = true
        notificationOptions.replyPlaceholder = 'Your Chat Reply'
    }

    // Image: Create Temporary Path
    const imageUrl = notificationOptions.icon || ''
    const imageProtocol = url.parse(imageUrl).protocol
    const imageFilepathTemporary = path.join(appTemporaryDirectory, `${appName}.push.${shortid.generate()}.png`)

    // Image: Skip
    if (!imageProtocol) {
        showNotification(notificationOptions, decoratedPush)

        return
    }

    // Image: Generate from Data URL
    if (imageProtocol === 'data:') {
        writeResizeImage(dataUriToBuffer(imageUrl), imageFilepathTemporary, (error, imageFilepathConverted) => {
            if (error) { return }

            notificationOptions.icon = imageFilepathConverted
            showNotification(notificationOptions, decoratedPush)
        })

        return
    }

    // Image: Download from Web
    imageDownloader.image({ url: imageUrl, dest: imageFilepathTemporary })
        .then((result) => {
            const imageFilepathDownloaded = result.filename
            const imageBuffer = result.image
            const imageType = fileType(imageBuffer)
            const isIco = icojs.isICO(imageBuffer)
            const isPng = imageType.mime === 'image/png'
            const isJpeg = imageType.mime === 'image/jpg' || imageType.mime === 'image/jpeg'

            // From .PNG
            if (isPng || isJpeg) {
                writeResizeImage(imageBuffer, imageFilepathDownloaded, (error, imageFilepathConverted) => {
                    if (error) { return }

                    notificationOptions.icon = imageFilepathConverted
                    showNotification(notificationOptions, decoratedPush)
                })

                return
            }

            // From .ICO
            if (isIco) {
                icojs.parse(imageBuffer, 'image/png').then(imageList => {
                    const imageMaximum = imageList[imageList.length - 1]
                    writeResizeImage(Buffer.from(imageMaximum.buffer), imageFilepathDownloaded, (error, imageFilepathConverted) => {
                        if (error) { return }

                        notificationOptions.icon = imageFilepathConverted
                        showNotification(notificationOptions, decoratedPush)
                    })
                })
            }

        })
        // Image: Fallback to App Icon
        .catch((error) => {
            logger.warn('convertPushToNotification', 'imageDownloader', error)

            showNotification(notificationOptions, decoratedPush)
        })
}

/**
 * Test if Push is ignored
 * @param {Object} push - Push Object
 * @returns {Boolean} - Yes / No
 */
let testIfPushIsIgnored = (push) => {
    //logger.debug('testIfPushIsIgnored')

    // Push inactive?
    if (!!!push.active) {
        return true
    }

    // Push dismissed
    if (push.direction === 'self' && !!push.dismissed) {
        return true
    }

    // Push SMS notifications empty?
    if (push.type === 'sms_changed' && !!!push.notifications.length) {
        return true
    }
}

/**
 * Get all Pushbullet Pushes sorted by recency (ascending)
 * @param {Number=} queueLimit - Limit result to fixed number
 * @returns {Array|undefined} List of Pushes
 */
let getRecentPushes = (queueLimit = 0) => {
    logger.debug('getRecentPushes')

    // List recent Pushes
    const recentPushesList = window.pb.api.pushes.all.filter(push => !testIfPushIsIgnored(push))

    // Sort recent Pushes (by date)
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

    // Return sliced list
    return recentPushesList.slice(recentPushesList.length - queueLimit, recentPushesList.length)
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

    pushes = _.isArray(pushes) ? pushes : [ pushes ]

    if (pushes.length === 0) {
        logger.warn('enqueuePush', 'pushes list was empty')
        callback(null, 0)

        return
    }

    let nextPushesList = pushes
    let notifyAfter = lastNotificationTimestamp || 0

    // Filter Pushes before lastNotificationTimestamp
    if (!!!ignoreDate) {
        nextPushesList = pushes.filter(push => push.created > notifyAfter)
    }

    nextPushesList.forEach((push, pushIndex, pushList) => {
        // Client Snoozing?
        const isSnoozing = (Date.now() < remote.getGlobal('snoozeUntil'))

        // Push ignored?
        const isIgnoredPush = testIfPushIsIgnored(push)

        if (!isSnoozing && !isIgnoredPush) {
            convertPushToNotification(push)
        }

        // Last Iteration?
        if (pushIndex !== pushList.length - 1) { return }

        // Store lastNotificationTimestamp
        if (push.created > notifyAfter) {
            lastNotificationTimestamp = push.created
            storePushbulletLastNotificationTimestamp(push.created)
        }

        // Update AppIcon Badge
        if (updateBadgeCount) {
            updateBadge(remote.app.getBadgeCount() + nextPushesList.length)
        }

        callback(null, pushList.length)
    })
}

/**
 * Get all new pushes and show them (if any)
 * @param {Function=} callback - Callback
 * @public
 */
let enqueueRecentPushes = (callback = () => {}) => {
    logger.debug('enqueueRecentPushes')

    const pushesList = getRecentPushes(recentPushesAmount)

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
}


/**
 * @listens ipcRenderer:tray-close
 */
ipcRenderer.on('tray-close', () => {
    logger.debug('ipcRenderer#tray-close')
})

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

/**
 * @typedef DecoratedPush
 * @mixes {Pushbullet.Push}
 */
