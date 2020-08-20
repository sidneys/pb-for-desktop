'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const path = require('path')
const url = require('url')

/**
 * Modules (Electron)
 * @constant
 */
const electron = require('electron')
const { ipcRenderer, remote } = electron

/**
 * Modules (Third party)
 * @constant
 */
const appRootPathDirectory = require('app-root-path').path
const domTools = require('@sidneys/dom-tools')
const logger = require('@sidneys/logger')({ write: true })
const parseDomain = require('parse-domain')
const { ParseResultType } = parseDomain

/**
 * Modules (Local)
 * @constant
 */
const configurationManager = remote.require('app/scripts/main-process/managers/configuration-manager')


/**
 * Filesystem
 * @constant
 */
const stylesheetFilepath = path.join(appRootPathDirectory, 'app', 'styles', 'injected', 'pushbullet-webview.css')


/**
 * Retrieve ShowAppBadgeCount
 * @return {Boolean} - Show
 */
let retrieveAppShowBadgeCount = () => configurationManager('appShowBadgeCount').get()


/**
 * Background Throttling Restoration Delay
 * @constant
 */
const backgroundThrottlingDelay = 5000


/**
 * DOM Components
 * @constant
 */
const body = document.querySelector('body')
const webviewViewElement = document.querySelector('#webview')
const spinnerViewElement = document.querySelector('#spinner')
const spinnerTextElement = document.querySelector('#spinner__text')
const helperMenuElement = document.querySelector('#supplemental-menu')
const buttons = {
    home: {
        element: document.querySelector('.supplemental-menu__button.home'),
        action: () => {
            webviewViewElement.goBack()
        }
    }
}

/**
 * Register navigation
 */
let didRegisterNavigation = false
let registerNavigation = () => {
    logger.debug('registerNavigation')

    if (didRegisterNavigation) { return }

    Object.keys(buttons).forEach((title) => {
        buttons[title].element.addEventListener('click', () => {
            logger.debug('button', 'click', title)
            buttons[title].action(buttons[title].element)
        })
    })

    didRegisterNavigation = true
}

/**
 * Offline handler
 */
let onOffline = () => {
    logger.debug('onOffline')

    // Show Spinner
    domTools.show(spinnerViewElement)
}

/**
 * Online handler
 */
let onOnline = () => {
    logger.debug('onOnline')

    // Bind Controls
    registerNavigation()

    // Hide Spinner
    domTools.hide(spinnerViewElement)
}

/**
 * Login handler
 */
let onLogin = () => {
    logger.debug('onLogin')

    domTools.setText(spinnerTextElement, 'logged in')
}

/** @namespace webContents.getLastWebPreferences() */

/**
 * Tray Menu Close handler
 */
let onTrayClose = () => {
    logger.debug('onTrayClose')

    const webContents = remote.getCurrentWebContents()

    // Get webPreferences
    const webPreferences = webContents.getLastWebPreferences()

    // Disable backgroundThrottling – then restore after Delay
    webContents.setBackgroundThrottling(true)
    const timeout = setTimeout(() => {
        webContents.setBackgroundThrottling(!!webPreferences.backgroundThrottling)

        clearTimeout(timeout)
    }, backgroundThrottlingDelay)
}


/**
 * Set application badge count
 * @param {Number} total - Number to set
 */
let updateBadge = (total) => {
    logger.debug('updateBadge')

    if (!retrieveAppShowBadgeCount()) { return }

    remote.app.badgeCount = total
}

/**
 * Wrapper for parse-domain URL Domain Parsing library
 * @param {String} url - URL
 * @returns {ParseResultType} - Domain Parsing Result
 */
let parseUrlDomains = (url) => {
    logger.debug('parseUrlDomains')

    // Try to parse url domain
    const parseResult = parseDomain.parseDomain(parseDomain.fromUrl(url))

    // Return parsing result or void if impossible

    return (parseResult.type === ParseResultType.Invalid) ? void 0 : parseResult
}


/**
 * @listens ipcRenderer#zoom
 */
ipcRenderer.on('zoom', (event, direction) => {
    logger.debug('ipcRenderer#zoom', 'direction', direction)

    const webContents = remote.getCurrentWebContents()

    switch (direction) {
        case 'in':
            webContents.setZoomLevel(webContents.getZoomLevel() + 1)
            break
        case 'out':
            webContents.setZoomLevel(webContents.getZoomLevel() - 1)
            break
        case 'reset':
            webContents.setZoomLevel(0)
    }
})


/**
 * @listens ipcRenderer#Event:tray-close
 */
ipcRenderer.on('tray-close', () => {
    logger.debug('ipcRenderer#tray-close')

    onTrayClose()
})


/**
 * @listens webviewViewElement#Event:did-fail-load
 */
webviewViewElement.addEventListener('did-fail-load', (error) => {
    logger.debug('webviewViewElement#did-fail-load')

    // An operation was aborted (due to user action)
    // https://cs.chromium.org/chromium/src/net/base/net_error_list.h
    if (error.errorCode === -3) {
        return
    }

    onOffline()
})

/**
 * @listens webviewViewElement#Event:did-navigate-in-page
 */
webviewViewElement.addEventListener('did-navigate-in-page', (event) => {
    logger.debug('webviewViewElement#did-navigate-in-page')

    /**
     * HOTFIX
     * Convert Event to Plain Object to satisfy Electron 9 V8 Structured Clone Algorithm limitations
     * @see {@link https://github.com/getsentry/sentry-electron/pull/215/files}
     */
    event = JSON.parse(JSON.stringify(event))

    // Forward event to webview for detecting navigation
    webviewViewElement.send('did-navigate-in-page', event)

    let hash = url.parse(event.url).hash

    if (!retrieveAppShowBadgeCount()) { return }

    switch (hash) {
        case '#devices':
        case '#following':
        case '#people':
        case '#sms':
            updateBadge(0)
            break
    }

    logger.debug('webviewViewElement#did-navigate-in-page', 'url', event.url)
})

/**
 * @listens webviewViewElement#Event:dom-ready
 */
webviewViewElement.addEventListener('dom-ready', () => {
    logger.debug('webviewViewElement#dom-ready')

    // Inject Page CSS
    domTools.injectStylesheet(webviewViewElement, stylesheetFilepath)

    /**
     * HOTFIX
     * Input cursor invisible after navigation in webview
     * @see {@link https://github.com/electron/electron/issues/14474}
     */
    webviewViewElement.blur()
    webviewViewElement.focus()
})

/** @namespace event.args */
/** @namespace event.channel */

/**
 * @listens webviewViewElement#Event:ipc-message
 */
webviewViewElement.addEventListener('ipc-message', (event) => {
    logger.debug('playerViewElement#ipc-message', 'channel', event.channel, 'args', event.args.join())

    switch (event.channel) {
        // Online
        case 'online':
            const isOnline = event.args[0]

            isOnline === true ? onOnline() : onOffline()

            break
        // Login
        case 'login':
            const isLogin = event.args[0]

            isLogin === true ? onLogin() : void 0

            break
    }
})


/**
 * Generate a unique identifier for the (Webview) URL from subdomain or pathname of a URL
 * @param {String} href - URL Href
 * @returns {String} Identifier
 */
let generateIdentifierForUrl = (href) => {
    logger.debug('generateIdentifierForUrl')

    // Try to parse URL domain
    const parsedDomains = parseUrlDomains(href)

    // Lookup URL subdomain, ignore if it is the "www" subdomain
    const subDomainList = parsedDomains.subDomains || []
    let subDomain = subDomainList.join('.')
    subDomain = !!subDomain && (subDomain !== 'www') ? subDomain : void 0

    // Lookup URL path name
    const pathName = url.parse(href).path.split(path.sep).filter(Boolean).pop()

    // Prefer subdomain as identifier, fallback to pathName
    return subDomain || pathName
}

/**
 *
 * @listens webviewViewElement#Event:load-commit
 */
webviewViewElement.addEventListener('load-commit', (event) => {
    logger.debug('webviewViewElement#load-commit')

    // Inject Page CSS
    domTools.injectStylesheet(webviewViewElement, stylesheetFilepath)

    // Try to parse url domain
    const parsedDomains = parseUrlDomains(event.url)
    // Abort if impossible
    if (!parsedDomains) { return }

    // Generate page identifier
    const pageIdentifier = generateIdentifierForUrl(event.url)

    switch (parsedDomains.domain) {
        // External Pages: GOOGLE, YOUTUBE, FACEBOOK
        case 'google':
        case 'youtube':
        case 'facebook':
            domTools.setVisibility(helperMenuElement, true)
            body.style.backgroundColor = 'rgb(236, 240, 240)'
            break

        // Internal Pages: APPS, CHANNELS, BLOG, API, HELP
        case 'pushbullet':
            switch (pageIdentifier) {
                case 'apps':
                case 'channels':
                case 'blog':
                case 'pro':
                case 'docs':
                case 'help':
                    // Show helper menu
                    domTools.setVisibility(helperMenuElement, true)
                    break
                default:
                    // Hide helper menu
                    domTools.setVisibility(helperMenuElement, false)
            }
    }

    // Status
    logger.debug('webview page loaded', 'url:', event.url)
    logger.debug('webview page loaded', 'domain:', parsedDomains.domain)
    logger.debug('webview page loaded', 'id:', `${pageIdentifier ? pageIdentifier : '-'}`)
})

/**
 * @listens webviewViewElement#Event:new-window
 */
webviewViewElement.addEventListener('new-window', (event) => {
    logger.debug('webviewViewElement#new-window')

    event.preventDefault()

    // Try to parse URL domain
    const parsedDomains = parseUrlDomains(event.url)

    if (parsedDomains.domain) {
        // Domain detected: External URL
        remote.shell.openExternal(event.url).then(() => {
            logger.info('Opened External Page URL:', event.url)
        })
    } else {
        // No Domain detected: Internal URL
        webviewViewElement.loadURL(event.url).then(() => {
            logger.info('Opened Internal Page URL:', event.url)
        })
    }
})


/**
 * @listens window#Event:load
 */
window.addEventListener('load', () => {
    logger.debug('window#load')

    // Add Platform CSS
    domTools.addPlatformClass()
})
