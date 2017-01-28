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
const { app, BrowserWindow, Menu, Tray } = require('electron');

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
const appProductName = packageJson.productName || packageJson.name;
const appVersion = packageJson.version;

/**
 * Paths
 * @global
 * @constant
 */
const appTrayIconDefault = path.join(appRootPath, 'icons', platformHelper.type, `icon-tray-default${platformHelper.templateImageExtension(platformHelper.type)}`);
const appTrayIconTransparent = path.join(appRootPath, 'icons', platformHelper.type, `icon-tray-transparent${platformHelper.templateImageExtension(platformHelper.type)}`);
const appTrayIconPaused = path.join(appRootPath, 'icons', platformHelper.type, `icon-tray-paused${platformHelper.templateImageExtension(platformHelper.type)}`);


/**
 * @global
 */
let trayMenu = {};


/**
 * Tray Menu Template
 * @global
 */
let getTrayMenuTemplate = () => {
    return [
        {
            id: 'productName',
            label: `Show ${appProductName}`,
            click() {
                BrowserWindow.getAllWindows()[0].show();
            }
        },
        {
            id: 'currentVersion',
            label: `Version ${appVersion}`,
            type: 'normal',
            enabled: false
        },
        {
            type: 'separator'
        },
        {
            id: 'showOnlyInTray',
            label: platformHelper.isMacOS ? 'Hide Dock Icon' : 'Minimize to Tray',
            icon: path.join(appRootPath, 'app', 'images', `icon-show-app-window${platformHelper.menuItemImageExtension}`),
            type: 'checkbox',
            checked: settings.getConfigurationItem('showOnlyInTray').get(),
            click(menuItem) {
                settings.getConfigurationItem('showOnlyInTray').set(menuItem.checked);
            }
        },
        {
            id: 'launchOnStartup',
            label: 'Launch on Startup',
            icon: path.join(appRootPath, 'app', 'images', `icon-launch-on-startup${platformHelper.menuItemImageExtension}`),
            type: 'checkbox',
            checked: settings.getConfigurationItem('launchOnStartup').get(),
            click(menuItem) {
                settings.getConfigurationItem('launchOnStartup').set(menuItem.checked);
            }
        },
        {
            id: 'replayOnLaunch',
            label: 'Replay Pushes on Start',
            icon: path.join(appRootPath, 'app', 'images', `icon-replay-on-launch${platformHelper.menuItemImageExtension}`),
            type: 'checkbox',
            checked: settings.getConfigurationItem('replayOnLaunch').get(),
            click(menuItem) {
                settings.getConfigurationItem('replayOnLaunch').set(menuItem.checked);
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'Snooze',
            label: 'Snooze',
            icon: path.join(appRootPath, 'app', 'images', `icon-snooze${platformHelper.menuItemImageExtension}`),
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
            id: 'soundEnabled',
            label: 'Play Sound Effects',
            icon: path.join(appRootPath, 'app', 'images', `icon-play-sound-effects${platformHelper.menuItemImageExtension}`),
            type: 'checkbox',
            checked: settings.getConfigurationItem('soundEnabled').get(),
            click(menuItem) {
                settings.getConfigurationItem('soundEnabled').set(menuItem.checked);
            }
        },
        {
            id: 'soundFile',
            label: 'Open Sound File...',
            type: 'normal',
            click() {
                settings.getConfigurationItem('soundFile').implement();
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
};

/**
 * @class
 * @extends Electron.Tray
 */
class TrayMenu extends Tray {
    constructor(template) {
        super(appTrayIconDefault);

        this.setToolTip(appProductName);
        this.setContextMenu(Menu.buildFromTemplate(template));

        /** @listens Electron.Tray#on */
        this.on('click', () => {
            logger.debug('tray-menu', 'Tray:click');

            if (platformHelper.isWindows) {
                let mainWindow = BrowserWindow.getAllWindows()[0];

                if (!mainWindow) { return; }

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
    if (snoozerService.isActive()) { return; }
    trayMenu.setState('default');
});

/** @listens connectivityService#on */
connectivityService.on('offline', () => {
    //logger.debug('tray-menu', 'connectivityService:offline');
    if (snoozerService.isActive()) { return; }
    trayMenu.setState('transparent');
});

/** @listens snoozerService#on */
snoozerService.on('snooze', (snoozing) => {
    logger.debug('tray-menu', 'snoozerService:snoozing', snoozing);

    if (snoozing) { trayMenu.setState('paused');
    } else { trayMenu.setState('default'); }
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
