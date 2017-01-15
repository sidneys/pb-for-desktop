'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const fs = require('fs-extra');
const os = require('os');
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
const fileType = require('file-type');
const keypath = require('keypath');
const readChunk = require('read-chunk');

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
let appName = packageJson.name;
let appVersion = packageJson.version;

/**
 * Paths
 * @global
 */
let appLogDirectory = (new Appdirectory(appName)).userLogs();
let appSoundDirectory = path.join(appRootPath, 'sounds').replace('app.asar', 'app.asar.unpacked');

/**
 * @global
 */
let autoLauncher = new AutoLaunch({
        name: appName,
        isHidden: true,
        mac: {
            useLaunchAgent: true
        }
    }),
    settings = electronSettings;


/**
 * Show App in Dock / Taskbar
 * @param {Boolean} show - True: show dock icon, false: hide icon
 */
let setShowAppWindow = function(show) {
    if (show) {
        if (platformHelper.isMacOS) {
            app.dock.show();
        } else {
            BrowserWindow.getAllWindows()[0].setSkipTaskbar(false);
        }
    } else {
        if (platformHelper.isMacOS) {
            app.dock.hide();
        } else {
            BrowserWindow.getAllWindows()[0].setSkipTaskbar(true);
        }
    }
};

/**
 * Handle App Settings Click
 * @param {Electron.MenuItem} menuItem - Menu item
 * @param {Object} settingsInstance - electron-settings instance
 * @param {String=} settingKeypath - Nested Keypath to registrable settings, e.g. 'options.app'
 * @param {Object=} eventObject - Optionally attach behaviour to options
 */
let toggleSettingsProperty = function(menuItem, settingsInstance, settingKeypath, eventObject) {
    let itemKeypath = settingKeypath;

    settingsInstance.setSync(itemKeypath, menuItem.checked);

    let handler = keypath(itemKeypath, eventObject);

    if (_.isFunction(handler)) {
        handler(menuItem);
    }
};

/**
 * Validate Files by Mimetype
 */
let validateFileType = function(file, targetType, cb) {
    let filePath = path.normalize(file.toString()),
        foundType;

    fs.stat(filePath, function(err) {
        if (err) { return cb(err); }

        foundType = fileType(readChunk.sync(filePath, 0, 262)).mime;

        if (!_(foundType).startsWith(targetType)) {
            return cb(foundType);
        }

        cb(null, filePath);
    });
};

/**
 * Settings Defaults
 * @property {String} internal.currentVersion - Application Version
 * @property {Boolean} internal.isVisible - Show Window on launch
 * @property {Number} internal.lastNotification - Timestamp of last delivered Pushbullet Push
 * @property {String} internal.logFile - Path to log file
 * @property {Number} internal.soundVolume - Notification sound volume
 * @property {Object} internal.windowBounds - Window position and size
 * @property {Boolean} user.showAppWindow - Show Main Window
 * @property {Boolean} user.playSoundEffects - Play Notification Sound
 * @property {Boolean} user.launchOnStartup - Autostart
 * @property {Boolean} user.replayOnLaunch - Show recent pushes
 * @property {String} user.soundFile - Path to notification sound file
 */
let settingsDefaults = {
    internal: {
        currentVersion: appVersion,
        isVisible: true,
        lastNotification: Math.floor(Date.now() / 1000) - 86400,
        logFile: path.join(appLogDirectory, appName + '.log'),
        soundVolume: 0.25,
        windowBounds: { x: 100, y: 100, width: 400, height: 550 }
    },
    user: {
        launchOnStartup: false,
        playSoundEffects: true,
        replayOnLaunch: true,
        showAppWindow: true,
        soundFile: path.join(appSoundDirectory, 'default.wav')
    }
};

/**
 * Settings Event Handlers
 */
let settingsEventHandlers = {
    user: {
        showAppWindow: function(item) {
            setShowAppWindow(item.checked);
        },
        launchOnStartup: function(item) {
            if (item.checked) {
                autoLauncher.enable();
            } else {
                autoLauncher.disable();
            }
        },
        soundFile: function(filePathList) {
            if (filePathList) {
                validateFileType(filePathList, 'audio', function(err, file) {
                    if (err) {
                        messengerService.showError(
                            `Incompatible filetype.${os.EOL}${os.EOL}Compatible formats are: .aiff, .m4a, .mp3, .mp4, .wav.`
                        );
                    }

                    settings.get('internal.windowBounds')
                        .then(value => {
                            BrowserWindow.getAllWindows()[0].setBounds(value);
                        });

                    settings.set('user.soundFile', file).then(() => {});
                });
            }
        }
    }
};


app.on('ready', () => {
    // Globals
    global.electronSettings = settings;

    // Settings Defaults
    settings.defaults(settingsDefaults);
    settings.applyDefaultsSync();

    // Fallback Settings
    fs.exists(settings.getSync('user.soundFile'), (exists) => {
        if (!exists) {
            settings.set('user.soundFile', settingsDefaults.user.soundFile).then(() => {
                logger.log('user.soundFile', 'reset to:', settingsDefaults.user.soundFile);
            });
        }
    });

    // Apply Settings
    settings.get('internal.windowBounds')
        .then(windowBounds => {
            BrowserWindow.getAllWindows()[0].setBounds(windowBounds);
        });

    settings.get('user.showAppWindow')
        .then(showAppWindow => {
            setShowAppWindow(showAppWindow);
        });

    settings.get('user.launchOnStartup')
        .then(launchOnStartup => {
            if (launchOnStartup) {
                autoLauncher.enable();
            } else {
                autoLauncher.disable();
            }
        });

    // Settings Configuration
    settings.configure({
        prettify: true,
        atomicSaving: true
    });


});


/**
 * @exports
 */
module.exports = {
    settings: settings,
    setShowAppWindow: setShowAppWindow,
    settingsDefaults: settingsDefaults,
    settingsEventHandlers: settingsEventHandlers,
    toggleSettingsProperty: toggleSettingsProperty
};
