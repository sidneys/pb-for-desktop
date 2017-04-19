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
const _ = require('lodash');
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
const messengerService = require(path.join(appRootPath, 'app', 'scripts', 'main', 'services', 'messenger-service'));

/**
 * Application
 * @constant
 * @default
 */
const appName = packageJson.name;
const appVersion = packageJson.version;

/**
 * Modules
 * Configuration
 */
let autoLauncher = new AutoLaunch({ name: appName, mac: { useLaunchAgent: true } });

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
const defaultDebounce = 300;


/**
 * Get Main Window
 * @returns {Electron.BrowserWindow}
 * @function
 */
let getPrimaryWindow = () => {
    logger.debug('getPrimaryWindow');

    return BrowserWindow.getAllWindows()[0];
};

/**
 * Show app in menubar or task bar only
 * @param {Boolean} enable - True: show dock icon, false: hide icon
 */
let setWindowInTrayOnly = (enable) => {
    logger.debug('setWindowInTrayOnly');

    let interval = setInterval(() => {
        const win = getPrimaryWindow();
        if (!win) { return; }

        switch (platformHelper.type) {
            case 'darwin':
                if (enable) {
                    app.dock.hide();
                } else { app.dock.show(); }
                break;
            case 'win32':
                win.setSkipTaskbar(enable);
                break;
            case 'linux':
                win.setSkipTaskbar(enable);
                break;
        }

        clearInterval(interval);
    }, defaultInterval);
};

/**
 * Configuration Items
 * @namespace
 */
let configurationItems = {
    /**
     * Application version
     * @readonly
     */
    internalVersion: {
        keypath: 'internalVersion',
        default: appVersion,
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Timestamp of last notification
     * @readonly
     */
    lastNotification: {
        keypath: 'lastNotification',
        default: Math.floor(Date.now() / 1000) - 86400,
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Launch on startup
     */
    launchOnStartup: {
        keypath: 'launchOnStartup',
        default: true,
        init() {
            logger.debug(this.keypath, 'init');

            this.implement(this.get());
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set', value);

            this.implement(value);
            electronSettings.set(this.keypath, value);
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value);

            if (value) {
                autoLauncher.enable();
            } else {
                autoLauncher.disable();
            }
        }
    },
    /**
     * Application log file
     * @readonly
     */
    logFile: {
        keypath: 'logFile',
        default: path.join(appLogDirectory, appName + '.log'),
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Repeat recent pushes on launch
     */
    replayOnLaunch: {
        keypath: 'replayOnLaunch',
        default: true,
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Application update release notes
     * @readonly
     */
    releaseNotes: {
        keypath: 'releaseNotes',
        default: '',
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Show application always on top
     */
    windowAlwaysOnTop: {
        keypath: 'windowAlwaysOnTop',
        default: false,
        init() {
            logger.debug(this.keypath, 'init');

            // Wait for main window
            let interval = setInterval(() => {
                const win = getPrimaryWindow();
                if (!win) { return; }

                this.implement(this.get());

                clearInterval(interval);
            }, defaultInterval);
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set', value);

            this.implement(value);
            electronSettings.set(this.keypath, value);
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value);

            const win = getPrimaryWindow();
            if (!win) { return; }

            win.setAlwaysOnTop(value);
        }
    },
    /**
     * Show notification badge count (macOS)
     */
    showBadgeCount: {
        keypath: 'showBadgeCount',
        default: false,
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Show application in menubar / taskbar only
     */
    windowInTrayOnly: {
        keypath: 'windowInTrayOnly',
        default: true,
        init() {
            logger.debug(this.keypath, 'init');

            this.implement(this.get());
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            this.implement(value);
            electronSettings.set(this.keypath, value);
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value);

            setWindowInTrayOnly(value);
        }
    },
    /**
     * Notification sound on / off
     */
    soundEnabled: {
        keypath: 'soundEnabled',
        default: true,
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Notification sound file
     */
    soundFile: {
        keypath: 'soundFile',
        default: path.join(appSoundDirectory, 'default.wav'),
        init() {
            logger.debug(this.keypath, 'init');

            if (!fs.existsSync(this.get())) {
                this.set(this.default);
            }
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');
            electronSettings.set(this.keypath, value);
        },
        implement() {
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
    /**
     * Notification sound volume
     * @readonly
     */
    soundVolume: {
        keypath: 'soundVolume',
        default: 0.5,
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Mirrored SMS
     */
    smsEnabled: {
        keypath: 'smsEnabled',
        default: true,
        init() {
            logger.debug(this.keypath, 'init');
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set');

            electronSettings.set(this.keypath, value);
        }
    },
    /**
     * Main Window position / size
     * @readonly
     */
    windowBounds: {
        keypath: 'windowBounds',
        default: { x: 100, y: 100, width: 400, height: 550 },
        init() {
            logger.debug(this.keypath, 'init');

            this.implement(this.get());

            /**
             * @listens Electron.App#before-quit
             */
            app.on('before-quit', () => {
                logger.debug('app#before-quit');

                const win = getPrimaryWindow();
                if (!win) { return; }
                const bounds = win.getBounds();
                if (!bounds) { return; }

                this.set(win.getBounds());
            });
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set', util.inspect(value));

            let debounced = _.debounce(() => {
                electronSettings.set(this.keypath, value);
            }, defaultDebounce);

            debounced();
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', util.inspect(value));

            let interval = setInterval(() => {
                const win = getPrimaryWindow();
                if (!win) { return; }

                win.setBounds(value);

                clearInterval(interval);
            }, defaultInterval);
        }
    },
    /**
     * Main Window visibility
     * @readonly
     */
    windowVisible: {
        keypath: 'windowVisible',
        default: true,
        init() {
            logger.debug(this.keypath, 'init');

            // Wait for main window
            let interval = setInterval(() => {
                const win = getPrimaryWindow();
                if (!win) { return; }

                this.implement(this.get());

                /**
                 * @listens Electron.BrowserWindow#show
                 */
                win.on('show', () => {
                    this.set(true);
                });

                /**
                 * @listens Electron.BrowserWindow#hide
                 */
                win.on('hide', () => {
                    this.set(false);
                });

                clearInterval(interval);
            }, defaultInterval);
        },
        get() {
            logger.debug(this.keypath, 'get');

            return electronSettings.get(this.keypath);
        },
        set(value) {
            logger.debug(this.keypath, 'set', value);

            let debounced = _.debounce(() => {
                electronSettings.set(this.keypath, value);
            }, defaultDebounce);

            debounced();
        },
        implement(value) {
            logger.debug(this.keypath, 'implement', value);

            const win = getPrimaryWindow();
            if (!win) { return; }

            if (value) { win.show(); }
            else { win.hide(); }
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
let getItem = (itemId) => {
    logger.debug('getConfigurationItem', itemId);

    if (configurationItems.hasOwnProperty(itemId)) {
        return configurationItems[itemId];
    }
};

/**
 * Get defaults of all items
 * @returns {Object}
 * @function
 */
let getConfigurationDefaults = () => {
    logger.debug('getConfigurationDefaults');

    let defaults = {};
    for (let item of Object.keys(configurationItems)) {
        defaults[item] = getItem(item).default;
    }

    return defaults;
};

/**
 * Set defaults of all items
 * @returns {Object}
 * @function
 */
let setConfigurationDefaults = (callback = () => {}) => {
    logger.debug('setConfigurationDefaults');

    let configuration = electronSettings.getAll();
    let configurationDefaults = getConfigurationDefaults();

    electronSettings.setAll(_.defaultsDeep(configuration, configurationDefaults));

    callback(null);
};

/**
 * Initialize all items – calling their init() method
 * @param {Function=} callback - Callback
 * @function
 */
let initializeItems = (callback = () => {}) => {
    logger.debug('initConfigurationItems');

    let configurationItemList = Object.keys(configurationItems);

    configurationItemList.forEach((item, itemIndex) => {
        getItem(item).init();

        // Last item
        if (configurationItemList.length === (itemIndex + 1)) {
            logger.debug('initConfigurationItems', 'complete');
            callback(null);
        }
    });
};

/**
 * Remove unknown items
 * @param {Function=} callback - Callback
 * @function
 */
let removeLegacyItems = (callback = () => {}) => {
    logger.debug('cleanConfiguration');

    let savedSettings = electronSettings.getAll();
    let savedSettingsList = Object.keys(savedSettings);

    savedSettingsList.forEach((item, itemIndex) => {
        if (!configurationItems.hasOwnProperty(item)) {
            electronSettings.delete(item);
            logger.debug('cleanConfiguration', 'deleted', item);
        }

        // Last item
        if (savedSettingsList.length === (itemIndex + 1)) {
            logger.debug('cleanConfiguration', 'complete');
            callback(null);
        }
    });
};


/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    // Remove item unknown
    setConfigurationDefaults(() => {
        // Initialize items
        initializeItems(() => {
            // Set Defaults
            removeLegacyItems(() => {
                logger.debug('app#will-finish-launching', 'complete');
            });
        });
    });
});

/**
 * @listens Electron.App#before-quit
 */
app.on('before-quit', () => {
    logger.debug('app#before-quit');

    logger.info('settings', electronSettings.getAll());
    logger.info('file', electronSettings.file());
});

/**
 * @exports
 */
module.exports = getItem;
