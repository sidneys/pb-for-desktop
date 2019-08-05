'use strict'


/**
 * Modules
 * Node
 * @constant
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')
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
const getYoutubeId = require('get-youtube-id')
const { Howl, Howler } = require('howler')
const icojs = require('icojs')
const imageDownloader = require('image-downloader')
const isDebug = require('@sidneys/is-env')('debug')
const jimp = require('jimp')
const logger = require('@sidneys/logger')({ write: true })
const moment = require('moment')
const notificationProvider = remote.require('@sidneys/electron-notification-provider')
const opn = require('opn')
const shortid = require('shortid')
const dynamicThrottledQueue = require('dynamic-throttled-queue')
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
 * General Defaults
 * @constant
 * @default
 */
const recentPushesAmount = 5

/**
 * URL Defaults
 * @constant
 * @default
 */
const faviconEndpoint = 'https://pb-for-desktop-besticon.herokuapp.com/icon?fallback_icon_color=4AB367&formats=ico,png&size=1..120..200&url='
const pushbulletIconEndpoint = 'https://www.pushbullet.com/img/deviceicons/'
const youtubeThumbnailEndpoint = 'https://img.youtube.com/vi/'


/**
 * Notification Defaults & Globals
 * @constant
 * @default
 * @global
 */
const notificationDisplayInterval = 1000
const notificationIconWidth = 88
const notificationFilterCommentTag = '//'
const notificationFilterDebugPrefix = '[FILTERED]'
const notificationQueue = dynamicThrottledQueue({ min_rpi: 1, interval: notificationDisplayInterval, evenly_spaced: true })


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
 * Retrieve PushbulletSoundFilePath
 * @return {String} - Path
 */
let retrievePushbulletSoundFilePath = () => configurationManager('pushbulletSoundFilePath').get()

/**
 * Retrieve AppSoundVolume
 * @return {Number} - Volume
 */
let retrievePushbulletSoundVolume = () => configurationManager('pushbulletSoundVolume').get()

/**
 * Retrieve PushbulletNotificationFilterFilePath
 * @return {String} - Path
 */
let retrievePushbulletNotificationFilterFilePath = () => configurationManager('pushbulletNotificationFilterFilePath').get()


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
 * Play Sound File
 * @param {Function=} callback - Callback
 */
let playSoundFile = (callback = () => {}) => {
    logger.debug('playSoundFile')

    // Retrieve pushbulletSoundEnabled
    const pushbulletSoundEnabled = retrievePushbulletSoundEnabled()

    // Skip if not enabled
    if (!pushbulletSoundEnabled) { return }

    // Retrieve pushbulletSoundFilePath, pushbulletSoundVolume
    const pushbulletSoundFilePath = retrievePushbulletSoundFilePath()
    const pushbulletSoundVolume = retrievePushbulletSoundVolume()

    // Create file:// URL
    const url = fileUrl(pushbulletSoundFilePath)

    // Create Sound
    const sound = new Howl({
        volume: pushbulletSoundVolume,
        src: [ url ],
        autoplay: true,
        preload: true,
        loop: false
    })

    /** @listens sound:Event#loaderror */
    sound.on('loaderror', (id, error) => {
        logger.error('playSoundFile', 'sound#loaderror', id, error)

        // Callback
        callback(error)
        return
    })

    /** @listens sound:Event#playerror */
    sound.on('playerror', (id, error) => {
        logger.error('playSoundFile', 'sound#playerror', id, error)

        // Callback
        callback(error)
        return
    })

    /** @listens sound:Event#end */
    sound.on('end', (id) => {
        logger.debug('playSoundFile', 'sound#end', id)

        // Callback
        callback()
        return
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
            iconDevice = `${pushbulletIconEndpoint}${device.icon}.png`
        }
    }

    // SMS Image
    let iconSms

    if (push.type === 'sms_changed') {
        iconSms = `${pushbulletIconEndpoint}phone.png`
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
        // Is YouTube URL?
        const youtubeId = getYoutubeId(push.url)
        if (youtubeId) {
            // Fetch YouTube Thumbnail
            iconLink = `${youtubeThumbnailEndpoint}${youtubeId}/hqdefault.jpg`
        } else {
            // Fetch Favicon
            iconLink = `${faviconEndpoint}${push.url}`
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

    switch (String(decoratedPush.type)) {
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
 * Check ANY of multiple regular expression patterns matches a given string
 * @param {String} text - String to test
 * @param {Array} patternList - List of regular expression patterns
 */
let matchTextAgainstRegexList = (text, patternList) => {
    logger.debug('matchTextAgainstRegexList')

    // Test if any of the regular expression patterns match
    const isMatch = patternList.some((pattern) => {
        // Convert pattern to regex
        const patternRegex = new RegExp(pattern, 'i')

        // DEBUG
        // logger.debug('matchTextAgainstRegexList', 'patternRegex', patternRegex)

        return patternRegex.test(text)
    })

    // Returns true if any regex pattern was matched
    return Boolean(isMatch)
}

/**
 * Parse a file, interpret each line as regex pattern, and check against a list of texts to determine if any matches
 * @param {String} filterFilePath - Absolute path to filter file
 * @param {Array} textList - List of strings to check against filter
 * @param {Function=} callback - Callback
 */
let compareTextListAgainstFilterFile = (filterFilePath, textList, callback = () => {}) => {
    logger.debug('compareTextListAgainstFilterFile')

    // Initialize filter entry list
    let filterEntryList = []

    // Initialize filter file reader
    const reader = readline.createInterface({
        input: fs.createReadStream(filterFilePath)
    })

    // Filter file reader: read next line
    reader.on('line', (line) => {
        logger.debug('compareTextListAgainstFilterFile', 'readline#line')

        // Only add filter entry if it's not comment (starting with "//")
        if (!line.startsWith(notificationFilterCommentTag)) {
            filterEntryList.push(line)
        }
    })

    // Filter file reader: error
    reader.on('error', (error) => {
        logger.error('compareTextListAgainstFilterFile', 'reader', error)

        // Callback
        callback(error)
        return
    })

    // Filter file reader: complete
    reader.on('close', () => {
        logger.debug('compareTextListAgainstFilterFile', 'readline#close')

        // Cleanup filter entries, removing empty
        filterEntryList = filterEntryList.filter(Boolean)

        // DEBUG
        // logger.debug('filter entries:')
        // filterEntryList.forEach(entry => logger.debug(entry))

        // Check if any filter entry matches any text
        const isFilterMatch = textList.some(text => matchTextAgainstRegexList(text, filterEntryList))

        // Callback
        callback(null, isFilterMatch)
        return
    })
}

/**
 * Show Notification
 * @param {Object} notificationOptions - NotificationConfiguration
 * @param {Pushbullet.Push|Object=} push - Pushbullet Push
 */
let showNotification = (notificationOptions, push) => {
    logger.debug('showNotification')

    // Retrieve pushbulletNotificationFilterFilePath
    const pushbulletNotificationFilterFilePath = retrievePushbulletNotificationFilterFilePath()

    // Create Notification
    const notification = notificationProvider.create(notificationOptions)

    /** @listens notification#click */
    notification.on('click', () => {
        logger.debug('notification#click')

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
        logger.debug('notification#close')

        // Dismiss within Pushbullet
        if (push) {
            dismissPush(push)
        }
    })

    /** @listens notification#reply */
    notification.on('reply', (event, message) => {
        logger.debug('notification#reply')

        if (!!!message) {
            logger.warn('reply message was empty')

            return
        }

        // SMS Reply
        if (push.type === 'sms_changed') {
            pbSms.reply(message, push.source_device_iden, pbSms.getMessageThreadId(push), (target) => {
                logger.debug('reply message sent', 'to:', target)
            })
        }

        // Chat Reply
        if (push.type === 'note' || push.type === 'link' || push.type === 'file') {
            createNotePush(message, push.sender_email, null, (target) => {
                logger.debug('reply message sent', 'to:', target)
            })
        }

    })

    /** @listens notification#error */
    notification.on('error', (error) => {
        logger.error('notification#error', error)
    })

    /** @listens notification#show */
    notification.on('show', (event) => {
        logger.debug('notification#show')

        logger.info('New Notification', notificationOptions.title)
    })

    // Notification Filter
    // Checks if notification title or body contain filtered terms
    compareTextListAgainstFilterFile(pushbulletNotificationFilterFilePath, [ notification.title, notification.body ], (error, isFiltered) => {
        // Filtered
        if (isFiltered) {
            logger.warn('Filtered:', notification.title)

            // DEBUG
            if (isDebug) {
                // Prefix Notification
                notification.title = `${notificationFilterDebugPrefix} ${notification.title}`
            } else {
                // Skip Notification
                return
            }
        }

        // Not filtered
        notificationQueue(() => {
            // Play Sound
            playSoundFile()
            // Show Notification
            notification.show()
        })
    })
}

/**
 * Asprect-Resize image and write it to disk
 * @param {ArrayBuffer|Array|*} source - Source image path
 * @param {String} target - Target image path
 * @param {Number} width - Image width
 * @param {Function=} callback - Callback
 */
let resizeWriteImage = (source, target, width, callback = () => {}) => {
    logger.debug('resizeWriteImage')

    jimp.read(source, (error, result) => {
        if (error) {
            logger.error('resizeWriteImage', 'jimp.read', error)

            // Callback
            callback(error)
            return
        }

        result.resize(width, jimp.AUTO).write(target, (error) => {
            if (error) {
                logger.error('resizeWriteImage', 'result.resize', error)

                callback(error)
                return
            }

            // Callback
            callback(null, target)
            return
        })
    }).then((result) => {
        logger.debug('resizeWriteImage', 'result', result)
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
        resizeWriteImage(dataUriToBuffer(imageUrl), imageFilepathTemporary, notificationIconWidth, (error, imageFilepathConverted) => {
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
                resizeWriteImage(imageBuffer, imageFilepathDownloaded, notificationIconWidth, (error, imageFilepathConverted) => {
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
                    resizeWriteImage(Buffer.from(imageMaximum.buffer), imageFilepathDownloaded, notificationIconWidth, (error, imageFilepathConverted) => {
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
 * Test if Push is dismissed via API
 * @param {Object} push - Push Object
 * @returns {Boolean} - Yes / No
 */
let testIfPushIsIgnored = (push) => {
    //logger.debug('testIfPushIsIgnored')

    // Push inactive?
    if (!!!push.active) {
        return true
    }

    // // Push directed at PB for Desktop and Push dismissed?
    // if (push.direction === 'self' && !!push.dismissed) {
    //     return true
    // }

    // Push is an SMS without enclosed notification?
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
let enqueuePushes = (pushes, ignoreDate = false, updateBadgeCount = true, callback = () => {}) => {
    logger.debug('enqueuePushes')

    pushes = _.isArray(pushes) ? pushes : [ pushes ]

    if (pushes.length === 0) {
        logger.warn('enqueuePushes', 'pushes list was empty')

        // Callback
        callback(null, 0)
        return
    }

    // Retrieve pushbulletLastNotificationTimestamp
    const pushbulletLastNotificationTimestamp = retrievePushbulletLastNotificationTimestamp()

    // Init pushes variables
    let nextPushesList = pushes
    let notifyAfterTimestamp = pushbulletLastNotificationTimestamp || 0

    // Filter Pushes before notifyAfterTimestamp
    if (!!!ignoreDate) {
        nextPushesList = pushes.filter(push => push.created > notifyAfterTimestamp)
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

        // Store pushbulletLastNotificationTimestamp
        if (push.created > notifyAfterTimestamp) {
            storePushbulletLastNotificationTimestamp(push.created)
        }

        // Update AppIcon Badge
        if (updateBadgeCount) {
            updateBadge(remote.app.getBadgeCount() + nextPushesList.length)
        }

        // Callback
        callback(null, pushList.length)
        return
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

    enqueuePushes(pushesList, true, false, (error, count) => {
        if (error) {
            logger.error('enqueueRecentPushes', error)

            // Callback
            callback(error)
            return
        }

        // Callback
        callback(null, count)
        return
    })
}

/**
 * Init
 */
let init = () => {
    logger.debug('init')

    // Configure Web Audio
    // https://github.com/goldfire/howler.js/issues/593
    Howler.autoSuspend = false
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
    enqueuePushes: enqueuePushes,
    enqueueRecentPushes: enqueueRecentPushes,
    updateBadge: updateBadge
}

/**
 * @typedef DecoratedPush
 * @mixes {Pushbullet.Push}
 */
