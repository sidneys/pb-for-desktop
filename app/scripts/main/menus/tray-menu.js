'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const os = require('os');
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const { app, ipcMain, Menu, Tray, webContents } = require('electron');

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
const dialogProvider = require('@sidneys/electron-dialog-provider');
const logger = require('@sidneys/logger')({ write: true });
const platformTools = require('@sidneys/platform-tools');

/**
 * Modules
 * Internal
 * @constant
 */
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));


/**
 * Application
 * @constant
 * @default
 */
const appCurrentVersion = global.manifest.version;
const appProductName = global.manifest.productName;

/**
 * Filesystem
 * @constant
 * @default
 */
const appSoundDirectory = global.filesystem.directories.sounds;

/**
 * Tray icons
 * @constant
 */
const trayIconDefault = path.join(appRootPath, 'app', 'images', `${platformTools.type}-tray-icon-default${platformTools.templateImageExtension(platformTools.type)}`);
const trayIconTransparent = path.join(appRootPath, 'app', 'images', `${platformTools.type}-tray-icon-transparent${platformTools.templateImageExtension(platformTools.type)}`);
const trayIconTransparentPause = path.join(appRootPath, 'app', 'images', `${platformTools.type}-tray-icon-transparent-pause${platformTools.templateImageExtension(platformTools.type)}`);

/**
 * Tray images
 * @constant
 */
const trayMenuItemImageAppAutoUpdate = path.join(appRootPath, 'app', 'images', `tray-item-appAutoUpdate${platformTools.menuItemImageExtension}`);
const trayMenuItemImageAppLaunchOnStartup = path.join(appRootPath, 'app', 'images', `tray-item-appLaunchOnStartup${platformTools.menuItemImageExtension}`);
const trayMenuItemImageAppShowBadgeCount = path.join(appRootPath, 'app', 'images', `tray-item-appShowBadgeCount${platformTools.menuItemImageExtension}`);
const trayMenuItemImageAppTrayOnly = path.join(appRootPath, 'app', 'images', `tray-item-appTrayOnly${platformTools.menuItemImageExtension}`);
const trayMenuItemImagePushbulletHideNotificationBody = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletHideNotificationBody${platformTools.menuItemImageExtension}`);
const trayMenuItemImagePushbulletRepeatRecentNotifications = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletRepeatRecentNotifications${platformTools.menuItemImageExtension}`);
const trayMenuItemImagePushbulletClipboardEnabled = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletClipboardEnabled${platformTools.menuItemImageExtension}`);
const trayMenuItemImagePushbulletSmsEnabled = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletSmsEnabled${platformTools.menuItemImageExtension}`);
const trayMenuItemImagePushbulletSoundEnabled = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletSoundEnabled${platformTools.menuItemImageExtension}`);
const trayMenuItemImagePushbulletSoundFile = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletSoundFile${platformTools.menuItemImageExtension}`);
const trayMenuItemImageReconnect = path.join(appRootPath, 'app', 'images', `tray-item-reconnect${platformTools.menuItemImageExtension}`);
const trayMenuItemImageReset = path.join(appRootPath, 'app', 'images', `tray-item-reset${platformTools.menuItemImageExtension}`);
const trayMenuItemImageSnooze = path.join(appRootPath, 'app', 'images', `tray-item-snooze${platformTools.menuItemImageExtension}`);
const trayMenuItemImageWindowTopmost = path.join(appRootPath, 'app', 'images', `tray-item-windowTopmost${platformTools.menuItemImageExtension}`);


/**
 * Get mainWindow
 * @returns {Electron.BrowserWindow}
 */
let getMainWindow = () => global.mainWindow;

/**
 * Get snoozerService
 * @returns {Electron.BrowserWindow}
 */
let getSnoozerService = () => global.snoozerService;


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
                global.mainWindow.show();
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
            click(menuItem) {
                configurationManager('appAutoUpdate').set(menuItem.checked);
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'reset',
            label: 'Reset Configuration...',
            icon: trayMenuItemImageReset,
            type: 'normal',
            click() {
                dialogProvider.question('Are you sure you want to reset?',
                    `${appProductName} will reset to its initial state.${os.EOL}Unsaved changes will be lost.`,
                    (result) => {
                        if (result === 0) {
                            configurationManager('appLaunchOnStartup').set(configurationManager('appLaunchOnStartup').default);
                            configurationManager('appShowBadgeCount').set(configurationManager('appShowBadgeCount').default);
                            configurationManager('appTrayOnly').set(configurationManager('appTrayOnly').default);
                            configurationManager('pushbulletLastNotificationTimestamp').set(configurationManager('pushbulletLastNotificationTimestamp').default);
                            configurationManager('pushbulletRepeatRecentNotifications').set(configurationManager('pushbulletRepeatRecentNotifications').default);
                            configurationManager('pushbulletSmsEnabled').set(configurationManager('pushbulletSmsEnabled').default);
                            configurationManager('pushbulletSoundEnabled').set(configurationManager('pushbulletSoundEnabled').default);
                            configurationManager('pushbulletSoundFile').set(configurationManager('pushbulletSoundFile').default);
                            configurationManager('pushbulletSoundVolume').set(configurationManager('pushbulletSoundVolume').default);
                            configurationManager('windowBounds').set(configurationManager('windowBounds').default);
                            configurationManager('windowTopmost').set(configurationManager('windowTopmost').default);
                            configurationManager('windowVisible').set(configurationManager('windowVisible').default);

                            const sessionList = webContents.getAllWebContents().map((contents) => {
                                return contents.session.clearCache ? contents.session : void 0;
                            });

                            sessionList.forEach((session, sessionIndex) => {
                                if (!session.clearCache) { return; }
                                session.clearCache(() => {
                                    session.clearStorageData({
                                        storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'serviceworkers', 'shadercache', 'websql'],
                                        quotas: ['persistent', 'syncable', 'temporary']
                                    }, () => {
                                        logger.info('logout', 'cleared cache and storage');
                                    });
                                });

                                if (sessionIndex === sessionList.length - 1) {
                                    app.relaunch();
                                    app.exit();
                                }
                            });
                        }
                    });
            }
        },
        {
            id: 'reconnect',
            label: 'Reconnect...',
            icon: trayMenuItemImageReconnect,
            type: 'normal',
            click() {
                dialogProvider.question('Are you sure you want to reconnect to Pushbullet?',
                    `${appProductName} will reconnect to Pushbullet.${os.EOL}` +
                    `All unsaved changes will be lost.`,
                    (result) => {
                        if (result === 0) {
                            logger.log('reconnect', 'relaunching');

                            app.relaunch();
                            app.exit();
                        }
                    });
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'pushbulletHideNotificationBody',
            label: 'Hide Notification Body Text',
            icon: trayMenuItemImagePushbulletHideNotificationBody,
            type: 'checkbox',
            checked: configurationManager('pushbulletHideNotificationBody').get(),
            click(menuItem) {
                configurationManager('pushbulletHideNotificationBody').set(menuItem.checked);
            }
        },
        {
            id: 'pushbulletClipboardEnabled',
            label: 'Universal Clipboard',
            icon: trayMenuItemImagePushbulletClipboardEnabled,
            type: 'checkbox',
            checked: configurationManager('pushbulletClipboardEnabled').get(),
            click(menuItem) {
                configurationManager('pushbulletClipboardEnabled').set(menuItem.checked);
            }
        },
        {
            id: 'pushbulletSmsEnabled',
            label: 'SMS Mirroring',
            icon: trayMenuItemImagePushbulletSmsEnabled,
            type: 'checkbox',
            checked: configurationManager('pushbulletSmsEnabled').get(),
            click(menuItem) {
                configurationManager('pushbulletSmsEnabled').set(menuItem.checked);
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
                configurationManager('appLaunchOnStartup').set(menuItem.checked);
            }
        },
        {
            id: 'pushbulletRepeatRecentNotifications',
            label: 'Replay Pushes on Launch',
            icon: trayMenuItemImagePushbulletRepeatRecentNotifications,
            type: 'checkbox',
            checked: configurationManager('pushbulletRepeatRecentNotifications').get(),
            click(menuItem) {
                configurationManager('pushbulletRepeatRecentNotifications').set(menuItem.checked);
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
                configurationManager('windowTopmost').set(menuItem.checked);
            }
        },
        {
            id: 'appTrayOnly',
            label: platformTools.isMacOS ? 'Hide Dock Icon' : 'Minimize to Tray',
            icon: trayMenuItemImageAppTrayOnly,
            type: 'checkbox',
            checked: configurationManager('appTrayOnly').get(),
            click(menuItem) {
                configurationManager('appTrayOnly').set(menuItem.checked);
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
                configurationManager('appShowBadgeCount').set(menuItem.checked);
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
                configurationManager('pushbulletSoundEnabled').set(menuItem.checked);
            }
        },
        {
            id: 'pushbulletSoundFile',
            label: 'Open Sound File...',
            icon: trayMenuItemImagePushbulletSoundFile,
            type: 'normal',
            click() {
                dialogProvider.file('Open Sound File (.m4a, .mp3, .mp4, .ogg, .wav)', ['m4a', 'mp3', 'mp4', 'wav', 'ogg'], appSoundDirectory, (error, soundFile) => {
                    if (error) {
                        logger.error('pushbulletSoundFile', 'dialogProvider.file', error);
                        return;
                    }

                    configurationManager('pushbulletSoundFile').set(soundFile);
                });
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'Snooze',
            label: 'Snooze',
            icon: trayMenuItemImageSnooze,
            submenu: [
                {
                    label: '1 hour snooze',
                    id: 'snooze-60',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(60, menuItem);
                    }
                },
                {
                    label: '4 hour snooze',
                    id: 'snooze-240',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(240, menuItem);
                    }
                },
                {
                    label: '8 hour snooze',
                    id: 'snooze-480',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(480, menuItem);
                    }
                },
                {
                    label: 'Indefinite snooze',
                    id: 'snooze-infinity',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().startSnooze(Infinity, menuItem);
                    }
                }
            ]
        },
        {
            type: 'separator'
        },
        {
            label: `Quit ${appProductName}`,
            click() {
                app.quit();
            }
        }
    ];
};


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
        logger.debug('constructor');

        super(trayIconDefault);

        this.template = template;
        this.menu = Menu.buildFromTemplate(this.template);

        this.init();
    }

    /**
     * Init
     */
    init() {
        logger.debug('init');

        this.setContextMenu(this.menu);

        /**
         * @listens Electron.Tray#click
         */
        this.on('click', () => {
            logger.debug('TrayMenu#click');

            if (platformTools.isMacOS) { return; }

            const mainWindow = getMainWindow();
            if (!mainWindow) { return; }

            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                app.focus();
            }
        });

        /**
         * @listens ipcMain
         */
        ipcMain.on('online', (event, isOnline) => {
            logger.debug('ipcMain#online', 'isOnline', isOnline);

            switch (isOnline) {
                case true:
                    this.setImageName('default');
                    break;
                case false:
                    this.setImageName('transparent');
                    break;
            }
        });

        /**
         * @listens ipcMain:
         */
        ipcMain.on('snooze', (event, isSnoozing) => {
            logger.debug('ipcMain#snooze', 'isSnoozing', isSnoozing);

            switch (isSnoozing) {
                case true:
                    this.setImageName('transparent-pause');
                    break;
                case false:
                    this.setImageName('default');
                    break;
            }
        });

        // Initial image
        this.setImageName('transparent');
    }

    /**
     * Set image name
     * @param {String} imageName - 'default', 'transparent', 'transparent-pause'
     */
    setImageName(imageName) {
        logger.debug('setImageName');

        if (this.imageName === imageName) { return; }

        this.imageName = imageName;

        switch (this.imageName) {
            case 'transparent':
                this.setImage(trayIconTransparent);
                break;
            case 'transparent-pause':
                this.setImage(trayIconTransparentPause);
                break;
            case 'default':
                this.setImage(trayIconDefault);
                break;
        }
    }
}


/**
 * Init
 */
let init = () => {
    logger.debug('init');

    // Ensure single instance
    if (!global.trayMenu) {
        global.trayMenu = new TrayMenu(createTrayMenuTemplate());
    }
};


/**
 * @listens Electron.App#Event:ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    init();
});


/**
 * @exports
 */
module.exports = global.trayMenu;
