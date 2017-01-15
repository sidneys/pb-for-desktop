'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const path = require('path');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const { app, BrowserWindow, dialog, Menu, Tray } = require('electron');

/**
 * Modules
 * External
 * @global
 * @const
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const settings = require(path.join(appRootPath, 'app', 'scripts', 'configuration', 'settings'));
const connectivityService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'connectivity-service'));
const snoozerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'snoozer-service'));


/**
 * App
 * @global
 * @constant
 */
let appProductName = packageJson.productName || packageJson.name;
let appVersion = packageJson.version;

/**
 * Paths
 * @global
 * @constant
 */
const appSoundDirectory = path.join(appRootPath, 'sounds').replace('app.asar', 'app.asar.unpacked');
const appTrayIconDefault = path.join(appRootPath, 'icons', platformHelper.type, 'icon-tray-default' + platformHelper.templateImageExtension(platformHelper.type));
const appTrayIconTransparent = path.join(appRootPath, 'icons', platformHelper.type, 'icon-tray-transparent' + platformHelper.templateImageExtension(platformHelper.type));
const appTrayIconPaused = path.join(appRootPath, 'icons', platformHelper.type, 'icon-tray-paused' + platformHelper.templateImageExtension(platformHelper.type));


/**
 * @global
 */
let trayMenu = {};


/**
 * Tray Menu Template
 * @global
 */
let getTrayMenuTemplate = () => {
    const template = [
        {
            label: `Show ${appProductName}`,
            click() {
                BrowserWindow.getAllWindows()[0].show();
            }
        },
        {
            label: `Version v${appVersion}`,
            type: 'normal',
            enabled: false
        },
        {
            type: 'separator'
        },
        {
            label: 'Show App Window',
            icon: path.join(appRootPath, 'app', 'images', 'icon-show-app-window' + platformHelper.menuItemImageExtension),
            type: 'checkbox',
            checked: settings.settings.getSync('user.showAppWindow'),
            click(menuItem) {
                return settings.toggleSettingsProperty(menuItem, settings.settings, 'user.showAppWindow', settings.settingsEventHandlers);
            }
        },
        {
            label: 'Launch on Startup',
            icon: path.join(appRootPath, 'app', 'images', 'icon-launch-on-startup' + platformHelper.menuItemImageExtension),
            type: 'checkbox',
            checked: settings.settings.getSync('user.launchOnStartup'),
            click(menuItem) {
                return settings.toggleSettingsProperty(menuItem, settings.settings, 'user.launchOnStartup', settings.settingsEventHandlers);
            }
        },
        {
            label: 'Replay Pushes on Start',
            icon: path.join(appRootPath, 'app', 'images', 'icon-replay-on-launch' + platformHelper.menuItemImageExtension),
            type: 'checkbox',
            checked: settings.settings.getSync('user.replayOnLaunch'),
            click(menuItem) {
                return settings.toggleSettingsProperty(menuItem, settings.settings, 'user.replayOnLaunch', settings.settingsEventHandlers);
            }
        },
        {
            type: 'separator'
        },
        {
            label: 'Snooze',
            icon: path.join(appRootPath, 'app', 'images', 'icon-snooze' + platformHelper.menuItemImageExtension),
            submenu: [
                {
                    label: 'Snooze for 1 Hour',
                    id: 'snooze-60',
                    type: 'checkbox',
                    click(menuItem) {
                        snoozerService.snooze(menuItem, 60);
                    }
                },
                {
                    label: 'Snooze for 4 Hours',
                    id: 'snooze-240',
                    type: 'checkbox',
                    click(menuItem) {
                        snoozerService.snooze(menuItem, 240);
                    }
                },
                {
                    label: 'Snooze for 8 Hours',
                    id: 'snooze-480',
                    type: 'checkbox',
                    click(menuItem) {
                        snoozerService.snooze(menuItem, 480);
                    }
                }
            ]
        },
        {
            type: 'separator'
        },
        {
            label: 'Play Sound Effects',
            icon: path.join(appRootPath, 'app', 'images', 'icon-play-sound-effects' + platformHelper.menuItemImageExtension),
            type: 'checkbox',
            checked: settings.settings.getSync('user.playSoundEffects'),
            click(menuItem) {
                return settings.toggleSettingsProperty(menuItem, settings.settings, 'user.playSoundEffects', settings.settingsEventHandlers);
            }
        },
        {
            label: 'Open Sound File...',
            type: 'normal',
            id: 'soundFile',
            click() {
                dialog.showOpenDialog({
                    title: 'Change Notification Sound', properties: ['openFile', 'showHiddenFiles'],
                    defaultPath: appSoundDirectory,
                    filters: [{ name: 'Sound', extensions: ['aiff', 'm4a', 'mp3', 'mp4', 'wav'] }]
                }, settings.settingsEventHandlers.user.soundFile);
            }
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

    return template;
};

/**
 * @class
 * @extends Electron#Tray
 */
class TrayMenu extends Tray {
    constructor(template) {
        super(appTrayIconDefault);

        this.setToolTip(appProductName);
        this.setContextMenu(Menu.buildFromTemplate(template));

        /** @listens Electron.Tray#on */
        this.on('click', () => {
            logger.debug('tray-menu', 'Tray:click');

            let mainWindow = BrowserWindow.getAllWindows()[0];

            if (platformHelper.isWindows) {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                }
            }
        });
    }

    /**
     * Set Tray Icon State
     * @param {String} state - Tray Icon Enable/Disable
     */
    setState(state) {
        //logger.debug('tray-menu', `setState( ${state} )`);

        switch (state) {
            case 'default':
                this.setImage(appTrayIconDefault);
                break;
            case 'transparent':
                this.setImage(appTrayIconTransparent);
                break;
            case 'paused':
                this.setImage(appTrayIconPaused);
                break;
        }
    }
}


/** @listens connectivityService#on */
connectivityService.on('online', () => {
    //logger.debug('tray-menu', 'connectivityService:online');

    trayMenu.setState('default');
});

/** @listens connectivityService#on */
connectivityService.on('offline', () => {
    //logger.debug('tray-menu', 'connectivityService:offline');

    trayMenu.setState('transparent');
});

/** @listens snoozerService#on */
snoozerService.on('enabled', () => {
    logger.debug('tray-menu', 'snoozerService:enabled');

    trayMenu.setState('paused');
});

/** @listens snoozerService#on */
snoozerService.on('disabled', () => {
    logger.debug('tray-menu', 'snoozerService:disabled');

    trayMenu.setState('default');
});

/** @listens Electron.App#on */
app.on('ready', () => {
    logger.debug('tray-menu', 'App:ready');

    trayMenu = new TrayMenu(getTrayMenuTemplate());
});


/**
 * @exports
 */
module.exports = trayMenu;
