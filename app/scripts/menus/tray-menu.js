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
const snoozeService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'snooze-service'));


/**
 * App
 * @global
 */
let appProductName = packageJson.productName || packageJson.name;
let appVersion = packageJson.version;

/**
 * Paths
 * @global
 */
let appSoundDirectory = path.join(appRootPath, 'sounds').replace('app.asar', 'app.asar.unpacked');
let appTrayIconDefault = path.join(appRootPath, 'icons', platformHelper.type, 'icon-tray-default' + platformHelper.templateImageExtension(platformHelper.type));
let appTrayIconTransparent = path.join(appRootPath, 'icons', platformHelper.type, 'icon-tray-transparent' + platformHelper.templateImageExtension(platformHelper.type));
let appTrayIconPaused = path.join(appRootPath, 'icons', platformHelper.type, 'icon-tray-paused' + platformHelper.templateImageExtension(platformHelper.type));

/**
 * @global
 */
let trayMenu = {};


/*
 *
 * Tray Menu Template
 */
let trayMenuTemplate = [
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
                    snoozeService.snooze(menuItem, 60);
                }
            },
            {
                label: 'Snooze for 4 Hours',
                id: 'snooze-240',
                type: 'checkbox',
                click(menuItem) {
                    snoozeService.snooze(menuItem, 240);
                }
            },
            {
                label: 'Snooze for 8 Hours',
                id: 'snooze-480',
                type: 'checkbox',
                click(menuItem) {
                    snoozeService.snooze(menuItem, 480);
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


class TrayMenu extends Tray {
    constructor() {
        super(appTrayIconDefault);

        this.setToolTip(appProductName);
        this.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate));

        // DEBUG
        logger.log('tray-menu', 'createTrayMenu');

        this.on('click', function(ev) {
            let win = BrowserWindow.getAllWindows()[0];

            if (platformHelper.isWindows) {
                if (win.isVisible()) {
                    win.hide();
                } else {
                    win.show();
                }
            }

            // DEBUG
            logger.debug('tray-menu', 'click', ev);
        });
    }

    /**
     * Set Tray Icon State
     * @param {String} state - Tray Icon Enable/Disable
     */

    setState(state) {
        // DEBUG
        logger.debug('tray-menu', 'state', state);

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


/**
 * @listens ipcMain:ipcEvent#network
 */
connectivityService.once('connection', (status, message) => {
    if (status === 'online') {
        trayMenu.setState('default');

        // DEBUG
        logger.debug('tray-item', 'connection', 'online', message);
    }
});

/**
 * @listens ipcMain:ipcEvent#network
 */
connectivityService.on('connection', (status, message) => {
    if (status === 'changed') {
        switch (message) {
            case 'online':
                trayMenu.setState('default');
                break;
            case 'offline':
                trayMenu.setState('transparent');
                break;
        }
        // DEBUG
        logger.debug('tray-item', 'connection', 'changed', message);
    }
});

/**
 * @listens ipcMain:ipcEvent#network
 */
snoozeService.on('snooze', (status) => {
    switch (status) {
        case 'enabled':
            trayMenu.setState('paused');
            break;
        case 'disabled':
            trayMenu.setState('default');
            break;
    }

    // DEBUG
    logger.debug('tray-item', 'snooze', 'status', status);
});


app.on('ready', () => {
    trayMenu = new TrayMenu();
});


/**
 * @exports
 */
module.exports = trayMenu;
