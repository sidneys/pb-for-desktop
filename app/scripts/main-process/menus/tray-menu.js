'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const os = require('os')
const path = require('path')

/**
 * Modules (Electron)
 * @constant
 */
const { app, ipcMain, Menu, MenuItem, shell, Tray, webContents } = require('electron')

/**
 * Modules (Third party)
 * @constant
 */
const appRootPathDirectory = require('app-root-path').path
const dialogProvider = require('@sidneys/electron-dialog-provider')
const electronUpdaterService = require('@sidneys/electron-updater-service')
const isDebug = require('@sidneys/is-env')('debug')
const logger = require('@sidneys/logger')({ write: true })
const platformTools = require('@sidneys/platform-tools')
const notificationProvider = require('@sidneys/electron-notification-provider')
const trash = require('trash')

/**
 * Modules (Local)
 * @constant
 */
const appManifest = require('app/scripts/main-process/components/globals').appManifest
const appFilesystem = require('app/scripts/main-process/components/globals').appFilesystem
const configurationManager = require('app/scripts/main-process/managers/configuration-manager')

/** @namespace global **/


/**
 * Application
 * @constant
 * @default
 */
const appCurrentVersion = appManifest.version
const appProductName = appManifest.productName

/**
 * Filesystem
 * @constant
 * @default
 */
const appSoundDirectory = appFilesystem.sounds
const appIconFile = appFilesystem.icon

/**
 * Tray icons
 * @constant
 */
const trayIconDefault = path.join(appRootPathDirectory, 'app', 'images', `${platformTools.type}-tray-icon-default${platformTools.templateImageExtension(platformTools.type)}`)
const trayIconTransparent = path.join(appRootPathDirectory, 'app', 'images', `${platformTools.type}-tray-icon-transparent${platformTools.templateImageExtension(platformTools.type)}`)
const trayIconTransparentPause = path.join(appRootPathDirectory, 'app', 'images', `${platformTools.type}-tray-icon-transparent-pause${platformTools.templateImageExtension(platformTools.type)}`)

/**
 * Tray images
 * @constant
 */
const trayMenuItemImageAppAutoUpdate = path.join(appRootPathDirectory, 'app', 'images', `tray-item-appAutoUpdate${platformTools.menuItemImageExtension}`)
const trayMenuItemImageAppLaunchOnStartup = path.join(appRootPathDirectory, 'app', 'images', `tray-item-appLaunchOnStartup${platformTools.menuItemImageExtension}`)
const trayMenuItemImageAppShowBadgeCount = path.join(appRootPathDirectory, 'app', 'images', `tray-item-appShowBadgeCount${platformTools.menuItemImageExtension}`)
const trayMenuItemImageAppTrayOnly = path.join(appRootPathDirectory, 'app', 'images', `tray-item-appTrayOnly${platformTools.menuItemImageExtension}`)
const trayMenuItemImagePushbulletHideNotificationBody = path.join(appRootPathDirectory, 'app', 'images', `tray-item-pushbulletHideNotificationBody${platformTools.menuItemImageExtension}`)
const trayMenuItemImagePushbulletRepeatRecentNotifications = path.join(appRootPathDirectory, 'app', 'images', `tray-item-pushbulletRepeatRecentNotifications${platformTools.menuItemImageExtension}`)
const trayMenuItemImagePushbulletClipboardEnabled = path.join(appRootPathDirectory, 'app', 'images', `tray-item-pushbulletClipboardEnabled${platformTools.menuItemImageExtension}`)
const trayMenuItemImagePushbulletSmsEnabled = path.join(appRootPathDirectory, 'app', 'images', `tray-item-pushbulletSmsEnabled${platformTools.menuItemImageExtension}`)
const trayMenuItemImagePushbulletSoundEnabled = path.join(appRootPathDirectory, 'app', 'images', `tray-item-pushbulletSoundEnabled${platformTools.menuItemImageExtension}`)
const trayMenuItemImagePushbulletSoundFilePath = path.join(appRootPathDirectory, 'app', 'images', `tray-item-pushbulletSoundFilePath${platformTools.menuItemImageExtension}`)
const trayMenuItemImageAppRestart = path.join(appRootPathDirectory, 'app', 'images', `tray-item-appRestart${platformTools.menuItemImageExtension}`)
const trayMenuItemImageAppReset = path.join(appRootPathDirectory, 'app', 'images', `tray-item-appReset${platformTools.menuItemImageExtension}`)
const trayMenuItemImageSnooze = path.join(appRootPathDirectory, 'app', 'images', `tray-item-snooze${platformTools.menuItemImageExtension}`)
const trayMenuItemImageWindowTopmost = path.join(appRootPathDirectory, 'app', 'images', `tray-item-windowTopmost${platformTools.menuItemImageExtension}`)
const trayMenuItemImagePushbulletNotificationFilterFilePath = path.join(appRootPathDirectory, 'app', 'images', `tray-item-pushbulletNotificationFilterFilePath${platformTools.menuItemImageExtension}`)


/**
 * Get the main BrowserWindow
 * @returns {Electron.BrowserWindow}
 */
let getMainWindow = () => global.mainWindow.browserWindow

/**
 * Get snoozerService
 * @returns {SnoozerService}
 */
let getSnoozerService = () => global.snoozerService


/**
 * Tray Menu Template
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
let createTrayMenuTemplate = () => {
    return [
        {
            id: 'appProductName',
            label: `Show ${appProductName}`,
            click() {
                getMainWindow().show()
            }
        },
        {
            id: 'appCurrentVersion',
            label: `v${appCurrentVersion}`,
            type: 'normal',
            enabled: false
        },
        {
            type: 'separator'
        },
        {
            id: 'appAutoUpdate',
            label: 'Automatic App Updates',
            icon: trayMenuItemImageAppAutoUpdate,
            type: 'checkbox',
            checked: configurationManager('appAutoUpdate').get(),
            enabled: !process.defaultApp,
            click(menuItem) {
                configurationManager('appAutoUpdate').set(menuItem.checked)
            }
        },
        {
            id: 'simulateAppUpdate',
            label: 'Trigger simulated App Update...',
            type: 'normal',
            visible: process.defaultApp || isDebug,
            click() {
                electronUpdaterService.simulate()
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'appRestart',
            label: 'Restart application...',
            icon: trayMenuItemImageAppRestart,
            type: 'normal',
            click() {
                dialogProvider.showConfirmation('Are you sure you want to restart PB for Desktop?',
                    `${appProductName} will restart and reconnect to Pushbullet.` +
                    `${os.EOL}${os.EOL}` +
                    `All unsaved changes will be lost.`,
                    (error, result) => {
                        logger.debug('appRestart', 'error:', error, 'result:', result)

                        // Handle Error
                        if (error) {
                            logger.error('appRestart', error)
                            return
                        }

                        // Handle Result
                        if (result.response === 1) {
                            // Status
                            logger.info('appRestart', 'relaunching')

                            // Restart
                            app.relaunch()
                            app.quit()
                        }
                    })
            }
        },
        {
            id: 'appReset',
            label: 'Reset application...',
            icon: trayMenuItemImageAppReset,
            type: 'normal',
            click() {
                dialogProvider.showConfirmation('Are you sure you want to reset?',
                    `${appProductName} will clear its configuration and revert the application to its initial state.` +
                    `${os.EOL}${os.EOL}` +
                    `All unsaved changes will be lost.`,
                    (error, result) => {
                        logger.debug('appReset', 'error:', error, 'result:', result)

                        // Handle Error
                        if (error) {
                            logger.error('appReset', error)
                            return
                        }

                        // Handle Result
                        if (result.response === 1) {
                            // Get user data directory
                            const userDataDirectory = app.getPath('userData')

                            // Delete user data directory
                            trash(userDataDirectory)
                                .then(() => {
                                    // Status
                                    logger.info('appReset', 'deleted user data:', userDataDirectory)
                                })
                                .catch((error) => {
                                    logger.error('appReset', 'trash', error)
                                })
                                .finally(() => {
                                    // Status
                                    logger.info('appReset', 'relaunching')

                                    // Restart
                                    app.relaunch()
                                    app.exit()
                                })
                        }
                    })
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'appLaunchOnStartup',
            label: 'Launch on Startup',
            icon: trayMenuItemImageAppLaunchOnStartup,
            type: 'checkbox',
            checked: configurationManager('appLaunchOnStartup').get(),
            click(menuItem) {
                configurationManager('appLaunchOnStartup').set(menuItem.checked)
            }
        },
        {
            id: 'pushbulletRepeatRecentNotifications',
            label: 'Replay Pushes on Launch',
            icon: trayMenuItemImagePushbulletRepeatRecentNotifications,
            type: 'checkbox',
            checked: configurationManager('pushbulletRepeatRecentNotifications').get(),
            click(menuItem) {
                configurationManager('pushbulletRepeatRecentNotifications').set(menuItem.checked)
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'pushbulletNotificationFilterFilePath',
            label: 'Notification Filter...',
            icon: trayMenuItemImagePushbulletNotificationFilterFilePath,
            type: 'normal',
            click() {
                shell.openItem(configurationManager('pushbulletNotificationFilterFilePath').get())
            }
        },
        {
            id: 'pushbulletHideNotificationBody',
            label: 'Hide Notification Body',
            icon: trayMenuItemImagePushbulletHideNotificationBody,
            type: 'checkbox',
            checked: configurationManager('pushbulletHideNotificationBody').get(),
            click(menuItem) {
                configurationManager('pushbulletHideNotificationBody').set(menuItem.checked)
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'pushbulletClipboardEnabled',
            label: 'Universal Clipboard',
            icon: trayMenuItemImagePushbulletClipboardEnabled,
            type: 'checkbox',
            checked: configurationManager('pushbulletClipboardEnabled').get(),
            click(menuItem) {
                configurationManager('pushbulletClipboardEnabled').set(menuItem.checked)
            }
        },
        {
            id: 'pushbulletSmsEnabled',
            label: 'SMS Mirroring',
            icon: trayMenuItemImagePushbulletSmsEnabled,
            type: 'checkbox',
            checked: configurationManager('pushbulletSmsEnabled').get(),
            click(menuItem) {
                configurationManager('pushbulletSmsEnabled').set(menuItem.checked)
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'windowTopmost',
            label: 'Always on Top',
            icon: trayMenuItemImageWindowTopmost,
            type: 'checkbox',
            checked: configurationManager('windowTopmost').get(),
            click(menuItem) {
                configurationManager('windowTopmost').set(menuItem.checked)
            }
        },
        {
            id: 'appTrayOnly',
            label: platformTools.isMacOS ? 'Hide Dock Icon' : 'Minimize to Tray',
            icon: trayMenuItemImageAppTrayOnly,
            type: 'checkbox',
            checked: configurationManager('appTrayOnly').get(),
            click(menuItem) {
                configurationManager('appTrayOnly').set(menuItem.checked)
            }
        },
        {
            id: 'appShowBadgeCount',
            visible: platformTools.isMacOS,
            label: 'Dock Icon Count',
            icon: trayMenuItemImageAppShowBadgeCount,
            type: 'checkbox',
            checked: configurationManager('appShowBadgeCount').get(),
            click(menuItem) {
                configurationManager('appShowBadgeCount').set(menuItem.checked)
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'pushbulletSoundEnabled',
            label: 'Play Sound Effects',
            icon: trayMenuItemImagePushbulletSoundEnabled,
            type: 'checkbox',
            checked: configurationManager('pushbulletSoundEnabled').get(),
            click(menuItem) {
                configurationManager('pushbulletSoundEnabled').set(menuItem.checked)
            }
        },
        {
            id: 'pushbulletSoundFilePath',
            label: 'Open Sound File...',
            icon: trayMenuItemImagePushbulletSoundFilePath,
            type: 'normal',
            click() {
                app.focus()
                dialogProvider.openFile(
                    'Open Sound File (.m4a, .mp3, .mp4, .ogg, .wav)',
                    [ 'm4a', 'mp3', 'mp4', 'wav', 'ogg' ],
                    appSoundDirectory,
                    (error, filePath) => {
                        // Handle Error
                        if (error) {
                            logger.error('pushbulletSoundFilePath', 'dialogProvider.openFile', error)

                            return
                        }

                        // Handle Result
                        configurationManager('pushbulletSoundFilePath').set(filePath)
                    })
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'snoozeNotifications',
            label: 'Snooze Notifications',
            icon: trayMenuItemImageSnooze,
            submenu: [
                {
                    label: 'Snooze 1 Minute',
                    id: 'snooze-1',
                    type: 'checkbox',
                    visible: isDebug,
                    click(menuItem) {
                        getSnoozerService().startSnooze(1, menuItem)
                    }
                },
                {
                    label: 'Snooze 30 Minutes',
                    id: 'snooze-30',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(30, menuItem)
                    }
                },
                {
                    label: 'Snooze 1 Hour',
                    id: 'snooze-60',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(60, menuItem)
                    }
                },
                {
                    label: 'Snooze 4 Hours',
                    id: 'snooze-240',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(240, menuItem)
                    }
                },
                {
                    label: 'Snooze 8 Hours',
                    id: 'snooze-480',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(480, menuItem)
                    }
                },
                {
                    label: 'Snooze Indefinitely',
                    id: 'snooze-infinity',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(Infinity, menuItem)
                    }
                }
            ]
        },
        {
            id: 'showTestNotification',
            label: 'Show Test Notification...',
            type: 'normal',
            click() {
                const notification = notificationProvider.create({
                    body: 'This is a test notification.',
                    icon: appIconFile,
                    title: 'Test Notification',
                    silent: false,
                    subtitle: 'Test Notification Subtitle'
                })
                notification.show()
            }
        },
        {
            type: 'separator'
        },
        {
            label: `Quit ${appProductName}`,
            click() {
                app.quit()
            }
        }
    ]
}


/**
 * @class TrayMenu
 * @property {Electron.MenuItemConstructorOptions[]} template - Template
 * @property {Electron.Menu} menu - Menu
 * @property {String} imageName - Icon name
 * @extends EventEmitter
 */
class TrayMenu extends Tray {
    /**
     * @param {Electron.MenuItemConstructorOptions[]} template - Menu template
     * @constructor
     */
    constructor(template) {
        logger.debug('constructor')

        super(trayIconDefault)

        this.template = template
        // this.menu = Menu.buildFromTemplate(this.template)

        this.menu = new Menu()
        template.forEach((menuItem) => {
            this.menu.append(new MenuItem(menuItem))
        })

        this.init()
    }

    /**
     * @fires TrayMenu#EventEmitter:tray-close
     */
    onClose() {
        logger.debug('onClose')

        // Notify webContents
        webContents.getAllWebContents().forEach(contents => contents.send('tray-close'))
    }

    /**
     * Init
     */
    init() {
        logger.debug('init')

        this.setContextMenu(this.menu)

        /**
         * @listens Electron.Tray#click
         */
        this.on('click', () => {
            logger.debug('TrayMenu#click')

            if (platformTools.isMacOS) { return }

            const mainWindow = getMainWindow()
            if (!mainWindow) { return }

            if (mainWindow.isVisible()) {
                mainWindow.hide()
            } else {
                mainWindow.show()
                app.focus()
            }
        })

        /**
         * @listens Electron.Menu#menu-will-close'
         */
        this.menu.on('menu-will-close', () => {
            logger.debug('TrayMenu#menu-will-close')

            // Emit
            this.onClose()
        })

        /**
         * @listens ipcMain
         */
        ipcMain.on('online', (event, isOnline) => {
            logger.debug('ipcMain#online', 'isOnline', isOnline)

            switch (isOnline) {
                case true:
                    // Online
                    this.setImageName('default')

                    break
                case false:
                    // Offline
                    this.setImageName('transparent')

                    break
            }
        })

        /**
         * @listens ipcMain:
         */
        ipcMain.on('snooze', (event, isSnoozing) => {
            logger.debug('ipcMain#snooze', 'isSnoozing', isSnoozing)

            switch (isSnoozing) {
                case true:
                    // Snooze started
                    this.setImageName('transparent-pause')

                    break
                case false:
                    // Snooze ended
                    this.setImageName('default')

                    break
            }
        })

        // Initial image
        this.setImageName('transparent')
    }

    /**
     * Set image name
     * @param {String} imageName - 'default', 'transparent', 'transparent-pause'
     */
    setImageName(imageName) {
        logger.debug('setImageName')

        if (this.imageName === imageName) { return }

        this.imageName = imageName

        switch (this.imageName) {
            case 'transparent':
                this.setImage(trayIconTransparent)
                break
            case 'transparent-pause':
                this.setImage(trayIconTransparentPause)
                break
            case 'default':
                this.setImage(trayIconDefault)
                break
        }
    }
}


/**
 * Init
 */
let init = () => {
    logger.debug('init')

    // Ensure single instance
    if (!global.trayMenu) {
        global.trayMenu = new TrayMenu(createTrayMenuTemplate())
    }
}


/**
 * @listens Electron.App#Event:ready
 */
app.once('ready', () => {
    logger.debug('app#ready')

    init()
})


/**
 * @exports
 */
module.exports = global.trayMenu
