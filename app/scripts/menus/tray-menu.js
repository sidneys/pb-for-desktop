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
let appTrayIconEnabled = path.join(appRootPath, 'icons', platformHelper.type, 'icon-tray-enabled' + platformHelper.templateImageExtension(platformHelper.type));
let appTrayIconDisabled = path.join(appRootPath, 'icons', platformHelper.type, 'icon-tray-disabled' + platformHelper.templateImageExtension(platformHelper.type));

/**
 * @global
 */
let appTray;
let trayMenu;

/**
 * @global
 */
global.snoozeUntil = 0;
let snoozeTimeout;


/**
 * Set Tray Icon State
 * @param {String} state - Tray Icon Enable/Disable
 */
let setTrayIconState = (state) => {
    switch (state) {
        case 'enabled':
            appTray.setImage(appTrayIconEnabled);
            break;
        case 'disabled':
            appTray.setImage(appTrayIconDisabled);
            break;
    }
};

/**
 * Show Internal Notification
 * @param {String} message - Content
 */
let showNotification = (message) => {
    BrowserWindow.getAllWindows()[0].webContents.send('notification-create', message);
};

/*
 * Snooze Notifications
 * @param {String} item - Menu item
 * @param {Number} duration - Snooze duration in minutes
 */
let snoozeNotifications = (menuItem, duration) => {

    let relatedItems = menuItem.menu.items.filter((item) => { return item.id && item.id.startsWith('snooze') && item.id !== menuItem.id; });
    let itemEnabled = menuItem.checked;
    let durationMs = parseInt(duration * (60 * 1000));
    let durationHours = parseInt(duration / 60);

    // Reset related menu items
    relatedItems.forEach((item) => {
        item.checked = false;
    });

    // Clear Timer
    clearTimeout(snoozeTimeout);

    // Abort Snooze
    if ((global.snoozeUntil !== 0)) {
        global.snoozeUntil = 0;
        setTrayIconState('enabled');
        showNotification('Aborting Snooze');
    }

    // Init Snooze
    if ((global.snoozeUntil === 0) && itemEnabled) {
        // Calculate Timestamp
        let snoozeEnd = (Date.now() + durationMs);
        global.snoozeUntil = snoozeEnd;
        setTrayIconState('disabled');
        showNotification(`Entered Snooze (${durationHours} Hours)`);

        // Schedule to waking up
        snoozeTimeout = setTimeout(function() {
            // End Snooze
            clearTimeout(snoozeTimeout);
            global.snoozeUntil = 0;
            menuItem.checked = false;
            setTrayIconState('enabled');
            showNotification(`Waking Up from Snooze (${durationHours} Hours)`);
        }, (snoozeEnd - Date.now()));
    }
};

/*
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
                    snoozeNotifications(menuItem, 60);
                }
            },
            {
                label: 'Snooze for 4 Hours',
                id: 'snooze-240',
                type: 'checkbox',
                click(menuItem) {
                    snoozeNotifications(menuItem, 240);
                }
            },
            {
                label: 'Snooze for 8 Hours',
                id: 'snooze-480',
                type: 'checkbox',
                click(menuItem) {
                    snoozeNotifications(menuItem, 480);
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

/**
 *  Init Tray Menu
 */
let createTrayMenu = () => {
    appTray = new Tray(appTrayIconDisabled);
    appTray.setToolTip(appProductName);
    trayMenu = Menu.buildFromTemplate(trayMenuTemplate);
    appTray.setContextMenu(trayMenu);

    /** @listens appTray#click*/
    appTray.on('click', () => {
        let win = BrowserWindow.getAllWindows()[0];

        if (platformHelper.isWindows) {
            if (win.isVisible()) {
                win.hide();
            } else {
                win.show();
            }
        }
    });

    // DEBUG
    logger.log('tray-menu', 'createTrayMenu');

    return trayMenu;
};

app.on('ready', () => {
    global.snoozeUntil = snoozeUntil;
    createTrayMenu();
});


/**
 * @exports
 */
module.exports = {
    create: createTrayMenu,
    setState: setTrayIconState
};
