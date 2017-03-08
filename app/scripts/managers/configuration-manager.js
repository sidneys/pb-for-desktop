'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const fs = require('fs-extra');
const path = require('path');
const util = require('util');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { remote } = electron;
const app = electron.app ? electron.app : remote.app;
const BrowserWindow = electron.BrowserWindow ? electron.BrowserWindow : remote.BrowserWindow;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
const Appdirectory = require('appdirectory');
const AutoLaunch = require('auto-launch');
const electronSettings = require('electron-settings');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const messengerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'messenger-service'));

/**
 * Application
 * @constant
 * @default
 */
const appName = packageJson.name;
const appVersion = packageJson.version;

/**
 * Filesystem
 * @constant
 * @default
 */
const appLogDirectory = (new Appdirectory(appName)).userLogs();
const appSoundDirectory = path.join(appRootPath, 'sounds').replace('app.asar', 'app.asar.unpacked');

/**
 * @constant
 * @default
 */
const defaultInterval = 1000;


/**
 * @implements auto-launch
 */
let autoLauncher = new AutoLaunch({ name: appName, mac: { useLaunchAgent: true } });

/**
 * @implements electron-settings
 */
electronSettings.configure({ atomicSaving: true, prettify: true });


/**
 * Get Main Window
 * @returns {Electron.BrowserWindow}
 * @function
 *
 * @private
 */
let getPrimaryWindow = () => {
    logger.debug('getPrimaryWindow');

    return BrowserWindow.getAllWindows()[0];
};

/**
 * Show app in menubar or taskbar only
 * @param {Boolean} showInTrayOnly - True: show dock icon, false: hide icon
 * @function
 *
 * @private
 */
let setShowInTrayOnly = (showInTrayOnly) => {
    logger.debug('setShowInTrayOnly', showInTrayOnly);

    if (platformHelper.isWindows || platformHelper.isLinux) {
        getPrimaryWindow().setSkipTaskbar(showInTrayOnly);

        /**
         * @fires Electron.BrowserWindow#show-in-tray-only
         */
        getPrimaryWindow().emit('show-in-tray-only', showInTrayOnly);
    }

    if (platformHelper.isMacOS) {
        if (showInTrayOnly) {
            app.dock.hide();
        } else {
            app.dock.show();
        }
    }
};

/**
 * Configuration Items
 * @namespace
 *
 * @private
 */
let configurationItems = {
    /** @description Application version */
    internalVersion: {
        /** @readonly */
        keypath: 'internalVersion',
        /** @default */
        default: appVersion,

        init(){
            logger.debug(this.keypath, 'init');
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(internalVersion) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, internalVersion).then(() => {});
        }
    },
    /** @description Timestamp of last notification */
    lastNotification: {
        /** @readonly */
        keypath: 'lastNotification',
        /** @default */
        default: Math.floor(Date.now() / 1000) - 86400,

        init(){
            logger.debug(this.keypath, 'init');
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(lastNotification) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, lastNotification).then(() => {});
        }
    },
    /** @description Launch on system start */
    launchOnStartup: {
        /** @readonly */
        keypath: 'launchOnStartup',
        /** @default */
        default: true,

        init(){
            logger.debug(this.keypath, 'init');

            this.implement(this.get());
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(launchOnStartup){
            logger.debug(this.keypath, 'set', launchOnStartup);

            this.implement(launchOnStartup);
            electronSettings.set(this.keypath, launchOnStartup).then(() => {});
        },
        implement(launchOnStartup){
            logger.debug(this.keypath, 'implement', launchOnStartup);

            if (launchOnStartup) {
                autoLauncher.enable();
            } else {
                autoLauncher.disable();
            }
        }
    },
    /** @description Logs file path */
    logFile: {
        /** @readonly */
        keypath: 'logFile',
        /** @default */
        default: path.join(appLogDirectory, appName + '.log'),

        init(){
            logger.debug(this.keypath, 'init');
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(logFile) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, logFile).then(() => {});
        }
    },
    /** @description Show last notifications on startup */
    replayOnLaunch: {
        /** @readonly */
        keypath: 'replayOnLaunch',
        /** @default */
        default: true,

        init(){
            logger.debug(this.keypath, 'init');
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(soundVolume) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, soundVolume).then(() => {});
        }
    },
    /** @description Show app in menubar or taskbar only */
    showInTrayOnly: {
        /** @readonly */
        keypath: 'showInTrayOnly',
        /** @default */
        default: true,

        init(){
            logger.debug(this.keypath, 'init');

            // Initialize when main BrowserWindow available
            let interval = setInterval(() => {
                if (!getPrimaryWindow()) { return; }

                this.implement(this.get());

                /**
                 * @listens Electron.BrowserWindow#on
                 */
                getPrimaryWindow().on('show-in-tray-only', (showInTrayOnly) => {
                    logger.debug(this.keypath, 'BrowserWindow#show-in-tray-only');

                    this.implement(showInTrayOnly);
                    this.set(showInTrayOnly);
                });

                clearInterval(interval);
            }, defaultInterval);
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(showInTrayOnly) {
            logger.debug(this.keypath, 'set');

            this.implement(showInTrayOnly);
            electronSettings.set(this.keypath, showInTrayOnly).then(() => {});
        },
        implement(showInTrayOnly) {
            logger.debug(this.keypath, 'implement', showInTrayOnly);

            setShowInTrayOnly(showInTrayOnly);
        }
    },
    /** @description Notification sound enabled */
    soundEnabled: {
        /** @readonly */
        keypath: 'soundEnabled',
        /** @default */
        default: true,

        init(){
            logger.debug(this.keypath, 'init');
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(soundVolume) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, soundVolume).then(() => {});
        }
    },
    /** @description Notification sound file path */
    soundFile: {
        /** @readonly */
        keypath: 'soundFile',
        /** @default */
        default: path.join(appSoundDirectory, 'default.wav'),

        init(){
            logger.debug(this.keypath, 'init');

            // Fallback
            fs.exists(this.get(), (exists) => {
                logger.debug(this.keypath, 'fs.exists');

                if (!exists) {
                    this.set(this.default);
                }
            });
        },
        get(){
            logger.debug(this.keypath, 'get');
            return electronSettings.getSync(this.keypath);
        },
        set(soundFile) {
            logger.debug(this.keypath, 'set');
            electronSettings.set(this.keypath, soundFile).then(() => {});
        },
        implement(){
            messengerService.openFile('Change Sound', 'audio', appSoundDirectory, (error, soundFile) => {
                logger.debug(this.keypath, 'implement', soundFile);

                if (error) {
                    logger.error(error.message);
                    return;
                }

                this.set(soundFile);
            });
        }
    },
    /** @description Notification sound volume */
    soundVolume: {
        /** @readonly */
        keypath: 'soundVolume',
        /** @default */
        default: 0.5,

        init(){
            logger.debug(this.keypath, 'init');
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(soundVolume) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, soundVolume).then(() => {});
        }
    },
    /** @description Main Window position and size */
    windowBounds: {
        /** @readonly */
        keypath: 'windowBounds',
        /** @default */
        default: { x: 100, y: 100, width: 400, height: 550 },

        init(){
            logger.debug(this.keypath, 'init');

            this.implement(this.get());

            /**
             * @listens Electron.App#before-quit
             */
            app.on('before-quit', () => {
                const bounds = getPrimaryWindow().getBounds();
                if (bounds) {
                    this.set(bounds);
                }
            });
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(windowBounds){
            logger.debug(this.keypath, 'set', JSON.stringify(windowBounds));

            electronSettings.set(this.keypath, windowBounds).then(() => {});
        },
        implement(windowBounds){
            logger.debug(this.keypath, 'implement', JSON.stringify(windowBounds));

            getPrimaryWindow().setBounds(windowBounds);
        }
    },
    /** @description Main Window visibility */
    windowVisible: {
        /** @readonly */
        keypath: 'windowVisible',
        /** @default */
        default: 'true',

        init(){
            logger.debug(this.keypath, 'init');

            // Wait for main window
            let interval = setInterval(() => {
                if (!getPrimaryWindow()) { return; }

                this.implement(this.get());

                /**
                 * @listens Electron.BrowserWindow#show
                 */
                getPrimaryWindow().on('show', () => {
                    this.set(true);
                });

                /**
                 * @listens Electron.BrowserWindow#hide
                 */
                getPrimaryWindow().on('hide', () => {
                    this.set(false);
                });

                /**
                 * @listens Electron~WebContents#dom-ready
                 */
                getPrimaryWindow().webContents.on('dom-ready', () => {
                    this.implement(this.get());
                });

                clearInterval(interval);
            }, defaultInterval);
        },
        get(){
            logger.debug(this.keypath, 'get');

            return electronSettings.getSync(this.keypath);
        },
        set(windowVisible){
            logger.debug(this.keypath, 'set', windowVisible);

            electronSettings.set(this.keypath, windowVisible).then(() => {});
        },
        implement(windowVisible){
            logger.debug(this.keypath, 'implement', windowVisible);

            if (windowVisible) {
                getPrimaryWindow().show();
            }
            else {
                getPrimaryWindow().hide();
            }
        }
    }
};

/**
 * Access single item
 * @returns {Object|void}
 * @function
 *
 * @public
 */
let getConfigurationItem = (itemId) => {
    logger.debug('getConfigurationItem', itemId);

    if (configurationItems.hasOwnProperty(itemId)) {
        return configurationItems[itemId];
    }
};

/**
 * Get defaults of all items
 * @returns {Object}
 * @function
 *
 * @private
 */
let getConfigurationDefaults = () => {
    logger.debug('getConfigurationDefaults');

    let defaults = {};
    for (let item of Object.keys(configurationItems)) {
        defaults[item] = getConfigurationItem(item).default;
    }

    return defaults;
};

/**
 * Initialize all items
 * @param {Function=} callback - Callback
 * @function
 *
 * @private
 */
let initConfigurationItems = (callback) => {
    logger.debug('initConfigurationItems');

    let cb = callback || function() {};

    let configurationItemList = Object.keys(configurationItems);

    configurationItemList.forEach((item, itemIndex) => {
        getConfigurationItem(item).init();

        // Last item
        if (configurationItemList.length === (itemIndex + 1)) {
            logger.debug('initConfigurationItems', 'complete');
            cb(configurationItemList.length);
        }
    });
};

/**
 * Remove unknown items
 * @param {Function=} callback - Callback
 * @function
 *
 * @private
 */
let cleanConfigurationItems = (callback) => {
    logger.debug('cleanConfiguration');

    let cb = callback || function() {};

    electronSettings.get().then((savedSettings) => {
        let savedSettingsList = Object.keys(savedSettings);

        savedSettingsList.forEach((item, itemIndex) => {
            if (!configurationItems.hasOwnProperty(item)) {
                electronSettings.deleteSync(item);
                logger.debug('cleanConfiguration', 'deleted', item);
            }

            // Last item
            if (savedSettingsList.length === (itemIndex + 1)) {
                logger.debug('cleanConfiguration', 'complete');
                cb(savedSettingsList.length);
            }
        });
    });
};


/**
 * @listens Electron.App#will-finish-launching
 */
app.once('will-finish-launching', () => {
    logger.debug('app#will-finish-launching');

    // Set item defaults
    electronSettings.defaults(getConfigurationDefaults());

    // Apply item defaults
    electronSettings.applyDefaults().then(() => {
        // Remove item unknown
        cleanConfigurationItems(() => {
            // Initialize items
            initConfigurationItems(() => {
                logger.debug('app#will-finish-launching', 'complete');
            });
        });
    });
});

/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready');
});

/**
 * @listens Electron.App#before-quit
 */
app.on('before-quit', () => {
    logger.debug('app#before-quit');

    logger.debug('settings', util.inspect(electronSettings.getSync()));
    logger.debug('file', electronSettings.getSettingsFilePath());
});

/**
 * @listens Electron.App#quit
 */
app.on('quit', () => {
    logger.debug('app#quit');
});


/**
 * @exports
 */
module.exports = {
    getConfigurationItem: getConfigurationItem,
    getItem: getConfigurationItem,
    settings: electronSettings
};
