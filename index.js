'use strict';

// Module to control application life.
const { app, BrowserWindow, Tray, Menu, shell, dialog, ipcMain } = require('electron');

const path = require('path'),
    storage = require('electron-json-storage'),
    _ = require('lodash');

const DEFAULT_WIDTH = 1024,
    DEFAULT_HEIGHT = 700;


// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow,
    mainPage,
    sysTray;

let appUrl = 'file://' + __dirname + '/app/index.html',
    appName = app.getName();

let appIconSuffix = { darwin: '.icns', linux: '.png', win32: '.ico' },
    appIcon = path.join(__dirname, 'icons', process.platform, 'app-icon' + appIconSuffix[process.platform]);

let trayIconSuffix = { darwin: 'Template.png', linux: '.png', win32: '.png' },
    trayIconDefault = path.join(__dirname, 'icons', process.platform, 'icon-tray' + trayIconSuffix[process.platform]),
    trayIconActive = path.join(__dirname, 'icons', process.platform, 'icon-tray-active' + trayIconSuffix[process.platform]),
    trayIconInverted = path.join(__dirname, 'icons', process.platform, 'icon-tray-inverted' + trayIconSuffix[process.platform]);

var settingsStore = storage,
    settingsDefault = {
        dock: true,
        notifyAfter: 0,
        version: app.getVersion()
    },
    settings = {};


var handleError = function(message) {
    dialog.showMessageBox({
        type: 'warning',
        icon: appIcon,
        buttons: ['Dismiss'],
        defaultId: 0,
        title: 'Error',
        message: 'Error',
        detail: message
    });
};



/**
 * Dock
 */
var setupDock = function(doShow) {
    if (doShow === true) {
        app.dock.show();
    } else {
        app.dock.hide();
    }
    settings.dock = doShow;
};

var toggleDock = function() {
    if (settings.dock !== null && settings.dock === true) {
        setupDock(false);
    } else {
        setupDock(true);
    }
};



/**
 * Settings
 */
var storeSettings = function(callback) {
    settingsStore.set('settings', settings, function(error) {
        if (error) {
            return handleError(error);
        }

        console.log('[storeSettingsProperty]', 'settings', JSON.stringify(settings, null, 3));

        callback();
    });
};

var initSettingsProperty = function(property, value) {
    var initialValue = value || null;
    if (settings.hasOwnProperty(property)) {
        return;
    }
    settings[property] = initialValue || null;

    console.log('[initSettingsProperty]', 'property', property, 'initialValue', initialValue, 'settingsDefaults[property]', settings[property]);
};

var getSettingsProperty = function(property) {
    if (typeof property === 'undefined') {
        return settings;
    }
    if (!settings.hasOwnProperty(property)) {
        initSettingsProperty(property);
    }

    console.log('[getSettingsProperty]', 'property', property, 'configDefaults[property]', settings[property]);
    return settings[property];
};

var setSettingsProperty = function(property, value, callback) {
    if (typeof property === 'undefined') {
        return false;
    }
    settings[property] = value;

    console.log('[setSettingsProperty]', 'property', property, 'value', value);

    storeSettings(callback);
    // return settings[property];
};



/**
 * IPC Event Handlers
 */
ipcMain.on('notification-received', () => {
    sysTray.setImage(trayIconActive);
});

ipcMain.on('notification-click', (event, options) => {
    var url = options.url;
    if (url) {
        return shell.openExternal(url);
    }

    mainWindow.show();
});

ipcMain.on('error-show', (event, message) => {
    handleError(message);
});

ipcMain.on('settings-get', (event, property) => {
    console.log('[settings-get]', 'property', property);

    event.sender.send('settings-get-reply', getSettingsProperty(property));
});

ipcMain.on('settings-set', (event, property, value) => {
    console.log('[settings-set]', 'property', property, 'value', value);

    setSettingsProperty(property, value, function() {
        event.sender.send('settings-set-reply', property, value);
    });
});



/**
 * App
 */
var windowOptions = {
    // Style
    icon: appIcon,
    title: appName,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    show: false,
    center: true,
    webPreferences: {
        nodeIntegration: true
    }
};

app.on('before-quit', () => {
    mainWindow.forceClose = true;
});

app.on('quit', () => {
    storeSettings();
});

app.on('activate', () => {
    mainWindow.show();
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {

    // Load Settings from file
    settingsStore.get('settings', function(error, result) {
        if (error) { return handleError(error); }

        // Commit Settings
        settings = result;
        _.defaults(settings, settingsDefault);
        console.log('[settingsStore.get]', 'result', result, 'settings', settings);

        // Init Tray
        sysTray = new Tray(trayIconDefault);
        sysTray.setImage(trayIconDefault);
        sysTray.setPressedImage(trayIconInverted);
        sysTray.setToolTip(appName);
        sysTray.setContextMenu(Menu.buildFromTemplate([
            { label: 'Show', click() { mainWindow.show(); } },
            { type: 'separator' },
            { label: 'Show Dock', type: 'checkbox', checked: settings.dock, click() { toggleDock(); } },
            { label: 'Quit', click() { app.quit(); } }
        ]));

        // Create the browser window.
        mainWindow = new BrowserWindow(windowOptions);

        setupDock(settings.dock);

        // and load the index.html of the app.
        mainWindow.loadURL(appUrl);

        // Emitted when the window is closed.
        mainWindow.on('closed', function() {
            // Dereference the window object, usually you would store windows
            // in an array if your app supports multi windows, this is the time
            // when you should delete the corresponding element.
            mainWindow = null;
        });

        mainWindow.on('focus', () => {
            sysTray.setImage(trayIconDefault);
        });

        mainWindow.on('close', e => {
            if (mainWindow.forceClose) {
                return;
            }
            e.preventDefault();
            mainWindow.hide();
        });

        mainPage = mainWindow.webContents;

        mainPage.on('dom-ready', () => {

            mainWindow.show();
            mainWindow.center();
        });
    });
});
