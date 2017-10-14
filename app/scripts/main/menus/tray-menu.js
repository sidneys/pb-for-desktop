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

/**
 * Modules
 * Internal
 * @constant
 */
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const dialogProvider = require(path.join(appRootPath, 'app', 'scripts', 'main', 'providers', 'dialog-provider'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


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
const trayIconDefault = path.join(appRootPath, 'app', 'images', `${platformHelper.type}-tray-icon-default${platformHelper.templateImageExtension(platformHelper.type)}`);
const trayIconTransparent = path.join(appRootPath, 'app', 'images', `${platformHelper.type}-tray-icon-transparent${platformHelper.templateImageExtension(platformHelper.type)}`);
const trayIconTransparentPause = path.join(appRootPath, 'app', 'images', `${platformHelper.type}-tray-icon-transparent-pause${platformHelper.templateImageExtension(platformHelper.type)}`);

/**
 * Tray images
 * @constant
 */
const trayMenuItemImageAppLaunchOnStartup = path.join(appRootPath, 'app', 'images', `tray-item-appLaunchOnStartup${platformHelper.menuItemImageExtension}`);
const trayMenuItemImageAppShowBadgeCount = path.join(appRootPath, 'app', 'images', `tray-item-appShowBadgeCount${platformHelper.menuItemImageExtension}`);
const trayMenuItemImageAppTrayOnly = path.join(appRootPath, 'app', 'images', `tray-item-appTrayOnly${platformHelper.menuItemImageExtension}`);
const trayMenuItemImagePushbulletHideNotificationBody = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletHideNotificationBody${platformHelper.menuItemImageExtension}`);
const trayMenuItemImagePushbulletRepeatRecentNotifications = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletRepeatRecentNotifications${platformHelper.menuItemImageExtension}`);
const trayMenuItemImagePushbulletSmsEnabled = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletSmsEnabled${platformHelper.menuItemImageExtension}`);
const trayMenuItemImagePushbulletSoundEnabled = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletSoundEnabled${platformHelper.menuItemImageExtension}`);
const trayMenuItemImagePushbulletSoundFile = path.join(appRootPath, 'app', 'images', `tray-item-pushbulletSoundFile${platformHelper.menuItemImageExtension}`);
const trayMenuItemImageReconnect = path.join(appRootPath, 'app', 'images', `tray-item-reconnect${platformHelper.menuItemImageExtension}`);
const trayMenuItemImageReset = path.join(appRootPath, 'app', 'images', `tray-item-reset${platformHelper.menuItemImageExtension}`);
const trayMenuItemImageSnooze = path.join(appRootPath, 'app', 'images', `tray-item-snooze${platformHelper.menuItemImageExtension}`);
const trayMenuItemImageWindowTopmost = path.join(appRootPath, 'app', 'images', `tray-item-windowTopmost${platformHelper.menuItemImageExtension}`);


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
            id: 'pushbulletSmsEnabled',
            label: 'Mirror SMS Messages',
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
            label: platformHelper.isMacOS ? 'Hide Dock Icon' : 'Minimize to Tray',
            icon: trayMenuItemImageAppTrayOnly,
            type: 'checkbox',
            checked: configurationManager('appTrayOnly').get(),
            click(menuItem) {
                configurationManager('appTrayOnly').set(menuItem.checked);
            }
        },
        {
            id: 'appShowBadgeCount',
            visible: platformHelper.isMacOS,
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
                    label: 'Snooze for 1 Hour',
                    id: 'snooze-60',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().snooze(menuItem, 1);
                    }
                },
                {
                    label: 'Snooze for 4 Hours',
                    id: 'snooze-240',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().snooze(menuItem, 240);
                    }
                },
                {
                    label: 'Snooze for 8 Hours',
                    id: 'snooze-480',
                    type: 'checkbox',
                    click(menuItem) {
                        getSnoozerService().snooze(menuItem, 480);
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
     * @constructs
     */
    constructor(template) {
        super(trayIconDefault);

        this.template = template;
        this.menu = Menu.buildFromTemplate(this.template);

        this.init();
    }

    /**
     * Init
     */
    init() {
        this.setToolTip(appProductName);
        this.setContextMenu(this.menu);

        /**
         * @listens Electron.Tray#click
         */
        this.on('click', () => {
            logger.debug('TrayMenu#click');

            if (platformHelper.isWindows) {
                const mainWindow = getMainWindow();
                if (!mainWindow) { return; }

                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                }
            }
        });

        /**
         * @listens ipcMain#networkState
         */
        ipcMain.on('network', (event, networkState) => {
            logger.debug('ipcMain#network');

            switch (networkState) {
                case 'offline':
                    this.setImageName('transparent');
                    break;
                case 'online':
                    this.setImageName('default');
                    break;
            }
        });

        /**
         * @listens ipcMain#snooze
         */
        ipcMain.on('snooze', (event, snoozeState) => {
            logger.debug('ipcMain#snooze');

            switch (snoozeState) {
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
