'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const fs = require('fs-extra')
const path = require('path')

/**
 * Modules (Electron)
 * @constant
 */
const electron = require('electron')
const { remote, BrowserWindow } = electron
const app = electron.app ? electron.app : remote.app

/**
 * Modules (Third party)
 * @constant
 */
const _ = require('lodash')
const appRootPathDirectory = require('app-root-path').path
const AutoLaunch = require('auto-launch')
const electronSettings = require('electron-settings')
const logger = require('@sidneys/logger')({ write: true })
const platformTools = require('@sidneys/platform-tools')
const electronUpdaterService = require('@sidneys/electron-updater-service')

/**
 * Modules (Local)
 * @constant
 */
const appManifest = require('app/scripts/main-process/components/globals').appManifest
const appFilesystem = require('app/scripts/main-process/components/globals').appFilesystem

/**
 * Application
 * @constant
 * @default
 */
const appName = appManifest.name

/**
 * Filesystem
 * @constant
 * @default
 */
const appLogsDirectory = appFilesystem.logs
const appSettingsFilePath = appFilesystem.settings
const appSoundsDirectory = appFilesystem.sounds

/**
 * Module Configuration
 */
const autoLauncher = new AutoLaunch({ name: appName, mac: { useLaunchAgent: true } })
electronSettings.configure({
    dir: path.dirname(appSettingsFilePath),
    fileName: path.basename(appSettingsFilePath),
    numSpaces: 4,
    prettify: true
})

/**
 * @constant
 * @default
 */
const defaultInterval = 1000
const defaultDebounce = 1000


/**
 * Get the main BrowserWindow
 * @returns {Electron.BrowserWindow}
 */
let getMainWindow = () => global.mainWindow.browserWindow

/**
 * Show app in menubar or task bar only
 * @param {Boolean} trayOnly - True: show dock icon, false: hide icon
 */
let setAppTrayOnly = (trayOnly) => {
    logger.debug('setAppTrayOnly')

    let interval = setInterval(() => {
        const primaryWindow = getMainWindow()
        if (!primaryWindow) { return }
        if (!primaryWindow.getBounds()) { return }


        switch (platformTools.type) {
            case 'darwin':
                if (trayOnly) {
                    app.dock.hide()
                } else {
                    app.dock.show().then()
                }
                break
            case 'win32':
                primaryWindow.setSkipTaskbar(trayOnly)
                break
            case 'linux':
                primaryWindow.setSkipTaskbar(trayOnly)
                break
        }

        clearInterval(interval)
    }, defaultInterval)
}

/** @namespace electronSettings.unsetSync */
/** @namespace electronSettings.file */
/** @namespace electronSettings.getSync */
/** @namespace electronSettings.setSync */
/** @namespace electronSettings.configure */

/**
 * configuration Items
 */
let configurationItems = {
    /**
     * appAutoUpdate
     */
    appAutoUpdate: {
        keypath: 'appAutoUpdate',
        default: false,
        init() {
            logger.debug(this.keypath, 'init')

            this.implement(this.get())
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            this.implement(value)
            electronSettings.setSync(this.keypath, value)
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value)

            if (!!value) {
                electronUpdaterService.enable()
            } else {
                electronUpdaterService.disable()
            }
        }
    },
    /**
     * appChangelog
     */
    appChangelog: {
        keypath: 'appChangelog',
        default: '',
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * appLaunchOnStartup
     */
    appLaunchOnStartup: {
        keypath: 'appLaunchOnStartup',
        default: true,
        init() {
            logger.debug(this.keypath, 'init')

            this.implement(this.get())
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set', value)

            this.implement(value)
            electronSettings.setSync(this.keypath, value)
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value)

            if (!!value) {
                autoLauncher.enable()
            } else {
                autoLauncher.disable()
            }
        }
    },
    /**
     * appLogFile
     */
    appLogFile: {
        keypath: 'appLogFile',
        default: path.join(appLogsDirectory, appName + '.log'),
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * appShowBadgeCount
     */
    appShowBadgeCount: {
        keypath: 'appShowBadgeCount',
        default: false,
        init() {
            logger.debug(this.keypath, 'init')

            this.implement(this.get())
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            this.implement(value)
            electronSettings.setSync(this.keypath, value)
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value)

            if (!value) {
                app.badgeCount = 0
            }
        }
    },
    /**
     * appTrayOnly
     */
    appTrayOnly: {
        keypath: 'appTrayOnly',
        default: false,
        init() {
            logger.debug(this.keypath, 'init')

            this.implement(this.get())
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            this.implement(value)
            electronSettings.setSync(this.keypath, value)
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value)

            setAppTrayOnly(value)
        }
    },
    /**
     * windowBounds
     */
    windowBounds: {
        keypath: 'windowBounds',
        default: { x: 256, y: 256, width: 320, height: 640 },
        init() {
            logger.debug(this.keypath, 'init')

            // Wait for window
            let interval = setInterval(() => {
                const primaryWindow = getMainWindow()
                if (!primaryWindow) { return }
                if (!primaryWindow.getBounds()) { return }

                // Observe future changes
                primaryWindow.on('move', event => this.set(event.sender.getBounds()))
                primaryWindow.on('resize', event => this.set(event.sender.getBounds()))

                // Apply saved value
                this.implement(this.get())

                clearInterval(interval)
            }, defaultInterval)
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set', value)

            let debounced = _.debounce(() => {
                electronSettings.setSync(this.keypath, value)
            }, defaultDebounce)
            debounced()
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value)

            const primaryWindow = getMainWindow()
            if (!primaryWindow) { return }
            if (!primaryWindow.getBounds()) { return }

            primaryWindow.setBounds(value)
        }
    },
    /**
     * windowTopmost
     */
    windowTopmost: {
        keypath: 'windowTopmost',
        default: false,
        init() {
            logger.debug(this.keypath, 'init')

            // Wait for window
            let interval = setInterval(() => {
                const primaryWindow = getMainWindow()
                if (!primaryWindow) { return }
                if (!primaryWindow.getBounds()) { return }

                this.implement(this.get())

                clearInterval(interval)
            }, defaultInterval)
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set', value)

            this.implement(value)
            electronSettings.setSync(this.keypath, value)
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value)

            BrowserWindow.getAllWindows().forEach((browserWindow) => {
                browserWindow.setAlwaysOnTop(value)
            })
        }
    },
    /**
     * windowVisible
     */
    windowVisible: {
        keypath: 'windowVisible',
        default: true,
        init() {
            logger.debug(this.keypath, 'init')

            // Wait for window
            let interval = setInterval(() => {
                const primaryWindow = getMainWindow()
                if (!primaryWindow) { return }
                if (!primaryWindow.getBounds()) { return }

                // Observe future changes
                primaryWindow.on('hide', () => this.set(false))
                primaryWindow.on('show', () => this.set(true))

                // Apply saved value
                this.implement(this.get())

                clearInterval(interval)
            }, defaultInterval)
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set', value)

            let debounced = _.debounce(() => {
                electronSettings.setSync(this.keypath, value)
            }, defaultDebounce)

            debounced()
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value)

            const primaryWindow = getMainWindow()
            if (!primaryWindow) { return }
            if (!primaryWindow.getBounds()) { return }

            if (!!value) {
                primaryWindow.show()
            } else {
                primaryWindow.hide()
            }
        }
    },
    /**
     * pushbulletHideNotificationBody
     */
    pushbulletHideNotificationBody: {
        keypath: 'pushbulletHideNotificationBody',
        default: false,
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * pushbulletLastNotificationTimestamp
     */
    pushbulletLastNotificationTimestamp: {
        keypath: 'pushbulletLastNotificationTimestamp',
        default: Math.floor(Date.now() / 1000) - 86400,
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * pushbulletRepeatRecentNotifications
     */
    pushbulletRepeatRecentNotifications: {
        keypath: 'pushbulletRepeatRecentNotifications',
        default: false,
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * pushbulletSoundEnabled
     */
    pushbulletSoundEnabled: {
        keypath: 'pushbulletSoundEnabled',
        default: true,
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * pushbulletSoundFilePath
     */
    pushbulletSoundFilePath: {
        keypath: 'pushbulletSoundFilePath',
        default: path.join(appSoundsDirectory, 'default.wav'),
        init() {
            logger.debug(this.keypath, 'init')

            if (!fs.existsSync(this.get())) {
                this.set(this.default)
            }
        },
        get() {
            logger.debug(this.keypath, 'get')

            return String(electronSettings.getSync(this.keypath))
        },
        set(value) {
            logger.debug(this.keypath, 'set')
            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * pushbulletNotificationFilterFilePath
     */
    pushbulletNotificationFilterFilePath: {
        keypath: 'pushbulletNotificationFilterFilePath',
        default: path.join(path.dirname(electronSettings.file()), 'filter.txt'),
        init() {
            logger.debug(this.keypath, 'init')

            // Install default "filter.txt" if it does not exist within the users settings yet
            if (!fs.existsSync(this.get())) {
                fs.copySync(path.join(appRootPathDirectory, 'app', 'user-settings', 'filter-template.txt'), this.default)
            }
        },
        get() {
            logger.debug(this.keypath, 'get')

            return String(electronSettings.getSync(this.keypath))
        },
        set(value) {
            logger.debug(this.keypath, 'set')
            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * pushbulletSoundVolume
     */
    pushbulletSoundVolume: {
        keypath: 'pushbulletSoundVolume',
        default: 0.5,
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            logger.debug(this.keypath, 'get')

            return parseFloat(String(electronSettings.getSync(this.keypath)))
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, parseFloat(value))
        }
    },
    /**
     * pushbulletClipboardEnabled
     */
    pushbulletClipboardEnabled: {
        keypath: 'pushbulletClipboardEnabled',
        default: false,
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            // logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, value)
        }
    },
    /**
     * pushbulletSmsEnabled
     */
    pushbulletSmsEnabled: {
        keypath: 'pushbulletSmsEnabled',
        default: true,
        init() {
            logger.debug(this.keypath, 'init')
        },
        get() {
            logger.debug(this.keypath, 'get')

            return electronSettings.getSync(this.keypath)
        },
        set(value) {
            logger.debug(this.keypath, 'set')

            electronSettings.setSync(this.keypath, value)
        }
    }
}

/**
 * @typedef ConfigurationItem
 * @property {String} keypath
 * @property {Boolean} default
 * @property {function} init
 * @property {function} get
 * @property {function} set
 */

/**
 * Access single item
 * @param {String} playlistItemId - configuration item identifier
 * @returns {ConfigurationItem|void}
 */
let getItem = (playlistItemId) => {
    //logger.debug('getConfigurationItem', playlistItemId);

    if (configurationItems.hasOwnProperty(playlistItemId)) {
        return configurationItems[playlistItemId]
    }
}

/**
 * Get defaults of all items
 * @returns {Object}
 */
let getConfigurationDefaults = () => {
    logger.debug('getConfigurationDefaults')

    let defaults = {}
    for (let item of Object.keys(configurationItems)) {
        defaults[item] = getItem(item).default
    }

    return defaults
}

/**
 * Set defaults of all items
 * @param {function(*)} callback - Callback
 */
let setConfigurationDefaults = (callback = () => {}) => {
    logger.debug('setConfigurationDefaults')

    let configuration = electronSettings.getSync()
    let configurationDefaults = getConfigurationDefaults()

    electronSettings.setSync(_.defaultsDeep(configuration, configurationDefaults))

    callback()
}

/**
 * Initialize all items – calling their init() method
 * @param {function(*)} callback - Callback
 * @function
 */
let initializeItems = (callback = () => {}) => {
    logger.debug('initconfigurationItems')

    let configurationItemList = Object.keys(configurationItems)

    configurationItemList.forEach((item, itemIndex) => {
        getItem(item).init()

        // Last item
        if (configurationItemList.length === (itemIndex + 1)) {
            logger.debug('initconfigurationItems', 'complete')
            callback()
        }
    })
}

/**
 * Remove unknown or stale settings items
 * @param {function(*)} callback - Callback
 * @function
 */
let removeLegacySettings = (callback = () => {}) => {
    logger.debug('removeLegacySettings')

    let savedSettings = electronSettings.getSync()
    let savedSettingsList = Object.keys(savedSettings)

    savedSettingsList.forEach((keypath, keypathIndex) => {
        if (!configurationItems.hasOwnProperty(keypath)) {
            electronSettings.unsetSync(keypath)
            logger.debug('removeLegacySettings', 'unset:', keypath)
        }

        // Last item keypath
        if (savedSettingsList.length === (keypathIndex + 1)) {
            logger.debug('removeLegacySettings', 'complete')
            callback()
        }
    })
}


/**
 * @listens Electron.App:ready
 */
app.once('ready', () => {
    logger.debug('app#ready')

    // Remove item unknown
    setConfigurationDefaults(() => {
        // Initialize items
        initializeItems(() => {
            // Set Defaults
            removeLegacySettings(() => {
                logger.debug('app#will-finish-launching', 'complete')
            })
        })
    })
})

/**
 * @listens Electron.App:will-quit
 */
app.on('will-quit', () => {
    logger.debug('app#will-quit')

    // Save settings
    electronSettings.setSync(electronSettings.getSync())

    // Prettify settings file
    electronSettings.configure({ numSpaces: 4, prettify: true })

    logger.debug('settings', electronSettings.getSync())
    logger.debug('file', electronSettings.file())
})

/**
 * @exports
 */
module.exports = getItem
