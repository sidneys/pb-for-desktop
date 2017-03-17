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
const { app, BrowserWindow, Menu, session, Tray } = require('electron');

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @constant
 */
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'managers', 'configuration-manager'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const messengerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'messenger-service'));
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const snoozerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'snoozer-service'));


/**
 * Application
 * @constant
 * @default
 */
const appProductName = packageJson.productName || packageJson.name;
const appVersion = packageJson.version;

/**
 * Filesystem
 * @constant
 * @default
 */
const appTrayIconDefault = path.join(appRootPath, 'icons', platformHelper.type, `icon-tray-default${platformHelper.templateImageExtension(platformHelper.type)}`);
const appTrayIconTransparent = path.join(appRootPath, 'icons', platformHelper.type, `icon-tray-transparent${platformHelper.templateImageExtension(platformHelper.type)}`);
const appTrayIconPaused = path.join(appRootPath, 'icons', platformHelper.type, `icon-tray-paused${platformHelper.templateImageExtension(platformHelper.type)}`);

/**
 * @constant
 * @default
 */
const defaultTimeout = 2000;


/**
 * @instance
 */
let trayMenu = {};

/**
 * Tray Menu Template
 * @function
 *
 * @private
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
            id: 'appVersion',
            label: `Version ${appVersion}`,
            type: 'normal',
            enabled: false
        },
        {
            type: 'separator'
        },
        {
            id: 'showInTrayOnly',
            label: platformHelper.isMacOS ? 'Hide Dock Icon' : 'Minimize to Tray',
            icon: path.join(appRootPath, 'app', 'images', `icon-show-in-tray-only${platformHelper.menuItemImageExtension}`),
            type: 'checkbox',
            checked: configurationManager.getConfigurationItem('showInTrayOnly').get(),
            click(menuItem) {
                configurationManager.getConfigurationItem('showInTrayOnly').set(menuItem.checked);
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'launchOnStartup',
            label: 'Launch on Startup',
            icon: path.join(appRootPath, 'app', 'images', `icon-launch-on-startup${platformHelper.menuItemImageExtension}`),
            type: 'checkbox',
            checked: configurationManager.getConfigurationItem('launchOnStartup').get(),
            click(menuItem) {
                configurationManager.getConfigurationItem('launchOnStartup').set(menuItem.checked);
            }
        },
        {
            id: 'replayOnLaunch',
            label: 'Replay Pushes on Launch',
            icon: path.join(appRootPath, 'app', 'images', `icon-replay-on-launch${platformHelper.menuItemImageExtension}`),
            type: 'checkbox',
            checked: configurationManager.getConfigurationItem('replayOnLaunch').get(),
            click(menuItem) {
                configurationManager.getConfigurationItem('replayOnLaunch').set(menuItem.checked);
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
            icon: path.join(appRootPath, 'app', 'images', `icon-sound-enabled${platformHelper.menuItemImageExtension}`),
            type: 'checkbox',
            checked: configurationManager.getConfigurationItem('soundEnabled').get(),
            click(menuItem) {
                configurationManager.getConfigurationItem('soundEnabled').set(menuItem.checked);
            }
        },
        {
            id: 'soundFile',
            label: 'Open Sound File...',
            icon: path.join(appRootPath, 'app', 'images', `icon-sound-file${platformHelper.menuItemImageExtension}`),
            type: 'normal',
            click() {
                configurationManager.getConfigurationItem('soundFile').implement();
            }
        },
        {
            type: 'separator'
        },
        {
            id: 'reconnect',
            label: 'Reconnect...',
            icon: path.join(appRootPath, 'app', 'images', `icon-reconnect${platformHelper.menuItemImageExtension}`),
            type: 'normal',
            click() {
                messengerService.showQuestion('Are you sure you want to reconnect to Pushbullet?',
                    `${appProductName} will reconnect to Pushbullet.${os.EOL}` +
                    `All unsaved changes will be lost.`,
                    (result) => {
                        if (result === 0) {
                            let timeout = setTimeout(() => {
                                logger.log('reconnect', 'relaunching');

                                app.relaunch();
                                app.exit();

                                clearTimeout(timeout);
                            }, defaultTimeout);
                        }
                    });
            }
        },
        {
            id: 'logout',
            label: 'Log out...',
            icon: path.join(appRootPath, 'app', 'images', `icon-logout${platformHelper.menuItemImageExtension}`),
            type: 'normal',
            click() {
                messengerService.showQuestion('Are you sure you want to log out from Pushbullet?',
                    `${appProductName} will log out from Pushbullet.${os.EOL}` +
                    `All unsaved changes will be lost.`,
                    (result) => {
                        if (result === 0) {
                            const ses = session.fromPartition('persist:app');

                            ses.clearCache(() => {
                                logger.debug('logout', 'cache cleared');

                                ses.clearStorageData({
                                    storages: [
                                        'appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache',
                                        'websql', 'serviceworkers'
                                    ],
                                    quotas: ['temporary', 'persistent', 'syncable']
                                }, () => {
                                    logger.debug('logout', 'storage cleared');

                                    let timeout = setTimeout(() => {
                                        logger.log('logout', 'relaunching');

                                        app.relaunch();
                                        app.exit();

                                        clearTimeout(timeout);
                                    }, defaultTimeout);
                                });
                            });
                        }
                    });
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

        /**
         * @listens Electron.Tray#click
         */
        this.on('click', () => {
            logger.debug('TrayMenu#click');

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
        logger.debug('setState', state);

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
 * @listens snoozerService#snooze
 */
snoozerService.on('snooze', (snoozing) => {
    logger.debug('snoozerService#snooze', snoozing);

    if (snoozing) {
        trayMenu.setState('paused');
    } else { trayMenu.setState('default'); }
});

/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    trayMenu = new TrayMenu(getTrayMenuTemplate());
});


/**
 * @exports
 */
module.exports = trayMenu;
