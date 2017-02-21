'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const fs = require('fs-extra');
const path = require('path');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const electron = require('electron');
const { remote } = electron;
const app = electron.app ? electron.app : remote.app;
const BrowserWindow = electron.BrowserWindow ? electron.BrowserWindow : remote.BrowserWindow;

/**
 * Modules
 * External
 * @global
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path').path;
const Appdirectory = require('appdirectory');
const AutoLaunch = require('auto-launch');
const electronSettings = require('electron-settings');
const keypath = require('keypath');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const messengerService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'messenger-service'));

/**
 * App
 * @global
 */
const appName = packageJson.name;
const appVersion = packageJson.version;

/**
 * Paths
 * @global
 */
let appLogDirectory = (new Appdirectory(appName)).userLogs();
let appSoundDirectory = path.join(appRootPath, 'sounds').replace('app.asar', 'app.asar.unpacked');


/**
 * @global
 * @constant
 */
const defaultInterval = 1000;


/**
 * @global
 */
let autoLauncher = new AutoLaunch({
    name: appName,
    isHidden: true,
    mac: {
        useLaunchAgent: true
    }
});


/**
 * Get Main Window
 * @returns {Electron.BrowserWindow}
 */
let getPrimaryWindow = () => {
    return BrowserWindow.getAllWindows()[0];
};


/**
 * Show App in Dock / Taskbar
 * @param {Boolean} setShowOnlyInTray - True: show dock icon, false: hide icon
 */
let setShowOnlyInTray = function(setShowOnlyInTray) {
    logger.debug('settings', 'setShowOnlyInTray()', setShowOnlyInTray);

    if (platformHelper.isWindows || platformHelper.isLinux) {
        getPrimaryWindow().setSkipTaskbar(setShowOnlyInTray);

        /** @fires window:show-only-in-tray-window */
        getPrimaryWindow().emit('show-only-in-tray-window', setShowOnlyInTray);
    }

    if (platformHelper.isMacOS) {
        if (setShowOnlyInTray) {
            app.dock.hide();
        } else {
            app.dock.show();
        }
    }
};



/**
 * Items
 * @namespace
 */
let configurationItems = {
    /** App Version */
    currentVersion: {
        /** @readonly */
        keypath: 'currentVersion',
        /** @default */
        default: appVersion,

        init(){
            logger.debug('settings', this.keypath, 'init()');
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(currentVersion) {
            logger.debug('settings', this.keypath, 'set()');

            electronSettings.set(this.keypath, currentVersion).then(() => {});
        }
    },
    /** Show Window */
    isVisible: {
        /** @readonly */
        keypath: 'isVisible:',
        /** @default */
        default: 'true',

        init(){
            logger.debug('settings', this.keypath, 'init()');

            // Apply
            this.implement(this.get());

            /** @listens Electron.BrowserWindow#on */
            getPrimaryWindow().on('show', () => { this.set(true); });
            getPrimaryWindow().on('hide', () => { this.set(false); });
            /** @listens Electron~WebContents#on */
            getPrimaryWindow().webContents.on('dom-ready', () => { this.implement(this.get()); });
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(isVisible){
            logger.debug('settings', this.keypath, 'set()', isVisible);

            electronSettings.set(this.keypath, isVisible).then(() => {});
        },
        implement(isVisible){
            logger.debug('settings', this.keypath, 'implement()', isVisible);

            if (isVisible) {
                getPrimaryWindow().show();
            }
            else {
                getPrimaryWindow().hide();
            }
        }
    },
    /** Last Push Timestamp */
    lastNotification: {
        /** @readonly */
        keypath: 'lastNotification',
        /** @default */
        default: Math.floor(Date.now() / 1000) - 86400,

        init(){
            logger.debug('settings', this.keypath, 'init()');
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(lastNotification) {
            logger.debug('settings', this.keypath, 'set()');

            electronSettings.set(this.keypath, lastNotification).then(() => {});
        }
    },
    /** Autostart */
    launchOnStartup: {
        /** @readonly */
        keypath: 'launchOnStartup',
        /** @default */
        default: true,

        init(){
            logger.debug('settings', this.keypath, 'init()');
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(launchOnStartup){
            logger.debug('settings', this.keypath, 'set()', launchOnStartup);

            this.implement(launchOnStartup);
            electronSettings.set(this.keypath, launchOnStartup).then(() => {});
        },
        implement(launchOnStartup){
            logger.debug('settings', this.keypath, 'implement()', launchOnStartup);

            if (launchOnStartup) { autoLauncher.enable(); }
            else { autoLauncher.disable(); }
        }
    },
    /** Path to log file */
    logFile: {
        /** @readonly */
        keypath: 'logFile',
        /** @default */
        default: path.join(appLogDirectory, appName + '.log'),

        init(){
            logger.debug('settings', this.keypath, 'init()');
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(logFile) {
            logger.debug('settings', this.keypath, 'set()');

            electronSettings.set(this.keypath, logFile).then(() => {});
        }
    },
    /** Play Sounds */
    soundEnabled: {
        /** @readonly */
        keypath: 'soundEnabled',
        /** @default */
        default: true,

        init(){
            logger.debug('settings', this.keypath, 'init()');
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(soundVolume) {
            logger.debug('settings', this.keypath, 'set()');

            electronSettings.set(this.keypath, soundVolume).then(() => {});
        }
    },
    /** Show recent pushes */
    replayOnLaunch: {
        /** @readonly */
        keypath: 'replayOnLaunch',
        /** @default */
        default: true,

        init(){
            logger.debug('settings', this.keypath, 'init()');
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(soundVolume) {
            logger.debug('settings', this.keypath, 'set()');

            electronSettings.set(this.keypath, soundVolume).then(() => {});
        }
    },
    /** Show Main Window */
    showOnlyInTray: {
        /** @readonly */
        keypath: 'showOnlyInTray',
        /** @default */
        default: true,

        init(){
            logger.debug('settings', this.keypath, 'init()');

            // Apply
            this.implement(this.get());

            /** @listens Electron.BrowserWindow#on */
            getPrimaryWindow().on('show-only-in-tray', (showOnlyInTray) => {
                logger.debug('settings', this.keypath, 'BrowserWindow:show-only-in-tray');
                this.implement(showOnlyInTray);
                this.set(showOnlyInTray);
            });
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(showOnlyInTray) {
            logger.debug('settings', this.keypath, 'set()');

            this.implement(showOnlyInTray);
            electronSettings.set(this.keypath, showOnlyInTray).then(() => {});
        },
        implement(showOnlyInTray) {
            logger.debug('settings', this.keypath, 'implement()', showOnlyInTray);

            setShowOnlyInTray(showOnlyInTray);
        }
    },
    /** Path to notification sound file */
    soundFile: {
        /** @readonly */
        keypath: 'soundFile',
        /** @default */
        default: path.join(appSoundDirectory, 'default.wav'),

        init(){
            logger.debug('settings', this.keypath, 'init()');
            logger.debug('this.get()', this.get());

            // Fallback Settings
            fs.exists(this.get(), (exists) => {
                logger.debug('settings', this.keypath, 'fs.exists');
                if (!exists) {
                    this.set(this.default);
                }
            });
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');
            return electronSettings.getSync(this.keypath);
        },
        set(soundFile) {
            logger.debug('settings', this.keypath, 'set()');
            electronSettings.set(this.keypath, soundFile).then(() => {});
        },
        implement(){
            messengerService.openFile('Change Sound', 'audio', appSoundDirectory, (error, soundFile) => {
                logger.debug('settings', this.keypath, 'implement()', soundFile);

                if (error) {
                    logger.error('settings', error.message);
                    return;
                }

                this.set(soundFile);
            });
        }
    },
    /** Notification sound volume */
    soundVolume: {
        /** @readonly */
        keypath: 'soundVolume',
        /** @default */
        default: 0.5,

        init(){
            logger.debug('settings', this.keypath, 'init()');
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(soundVolume) {
            logger.debug('settings', this.keypath, 'set()');

            electronSettings.set(this.keypath, soundVolume).then(() => {});
        }
    },
    /** Window position and size */
    windowBounds: {
        /** @readonly */
        keypath: 'windowBounds',
        /** @default */
        default: { x: 100, y: 100, width: 400, height: 550 },

        init(){
            logger.debug('settings', this.keypath, 'init()');

            // Apply
            this.implement(this.get());

            /** @listens Electron.BrowserWindow#on */
            getPrimaryWindow().on('move', () => { this.set(getPrimaryWindow().getBounds()); });
            getPrimaryWindow().on('resize', () => { this.set(getPrimaryWindow().getBounds()); });
        },
        get(){
            logger.debug('settings', this.keypath, 'get()');

            return electronSettings.getSync(this.keypath);
        },
        set(windowBounds){
            logger.debug('settings', this.keypath, 'set()', JSON.stringify(windowBounds));

            electronSettings.set(this.keypath, windowBounds).then(() => {});
        },
        implement(windowBounds){
            logger.debug('settings', this.keypath, 'implement()', JSON.stringify(windowBounds));

            getPrimaryWindow().setBounds(windowBounds);
        }
    }
};


/**
 * Accessor
 * @returns {Object|void}
 */
let getConfigurationItem = (itemId) => {
    logger.debug('settings', 'getConfigurationItem()', itemId);

    if (configurationItems.hasOwnProperty(itemId)) {
        return configurationItems[itemId];
    }
};

/**
 * Item Defaults
 * @returns {Object}
 */
let getConfigurationDefaults = () => {
    logger.debug('settings', 'getConfigurationDefaults()');

    let defaults = {};
    for (let id of Object.keys(configurationItems)) {
        defaults[id] = getConfigurationItem(id).default;
    }
    return defaults;
};

/**
 * Item Initializer
 */
let initConfigurationItems = () => {
    logger.debug('settings', 'initConfigurationItems()');

    /** @listens Electron.BrowserWindow#on */
    let interval = setInterval(() => {
        if (!getPrimaryWindow()) { return; }

        for (let id of Object.keys(configurationItems)) {
            getConfigurationItem(id).init();
        }

        clearInterval(interval);
    }, defaultInterval);
};


app.on('ready', () => {
    // Settings Defaults
    electronSettings.defaults(getConfigurationDefaults());
    electronSettings.applyDefaultsSync();

    // Fallback Settings
    initConfigurationItems();

    // Settings Configuration
    electronSettings.configure({
        prettify: true,
        atomicSaving: true
    });


});


/**
 * @exports
 */
module.exports = {
    electronSettings: electronSettings,
    getConfigurationItem: getConfigurationItem,
    setShowAppWindow: setShowOnlyInTray,
    settingsDefaults: getConfigurationDefaults()
};
