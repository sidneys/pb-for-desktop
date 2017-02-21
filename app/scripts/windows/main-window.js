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
const electron = require('electron');
const { app, BrowserWindow, shell } = electron;

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;
const electronConnect = require('electron-connect');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const isLivereload = require(path.join(appRootPath, 'lib', 'is-livereload'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * App
 * @global
 * @constant
 */
const appIcon = path.join(appRootPath, 'icons', platformHelper.type, 'icon' + platformHelper.iconImageExtension(platformHelper.type));
const appProductName = packageJson.productName || packageJson.name;
const appUrl = 'file://' + path.join(appRootPath, 'app', 'html', 'main.html');


/**
 * @global
 */
let mainWindow;


/**
 * MainWindow
 * @class
 * @extends Electron.BrowserWindow
 */
class MainWindow extends BrowserWindow {
    constructor() {
        super({
            acceptFirstMouse: true,
            autoHideMenuBar: !isDebug,
            backgroundColor: platformHelper.isMacOS ? '#0095A5A6' : '#95A5A6',
            frame: true,
            fullscreenable: true,
            icon: appIcon,
            minHeight: 512,
            minWidth: 256,
            show: false,
            thickFrame: true,
            title: appProductName,
            titleBarStyle: 'default',
            transparent: false,
            vibrancy: 'dark',
            webPreferences: {
                allowDisplayingInsecureContent: true,
                allowRunningInsecureContent: true,
                experimentalFeatures: true,
                nodeIntegration: true,
                webaudio: true,
                webgl: false,
                webSecurity: false
            }
        });

        this.init();
    }

    init() {
        logger.debug('main-window', 'init()');

        /** @listens Electron.BrowserWindow#on */
        this.on('close', ev => {
            logger.debug('main-window', 'BrowserWindow:close');

            if (!app.isQuitting) {
                ev.preventDefault();
                this.hide();
            }
        });

        /** @listens Electron.BrowserWindow#on */
        this.on('show', () => {
            logger.debug('main-window', 'BrowserWindow:show');
        });

        /** @listens Electron.BrowserWindow#on */
        this.on('hide', () => {
            logger.debug('main-window', 'BrowserWindow:hide');
        });

        /** @listens Electron.BrowserWindow#on */
        this.on('move', () => {
            logger.debug('main-window', 'BrowserWindow:move');
        });

        /** @listens Electron.BrowserWindow#on */
        this.on('resize', () => {
            logger.debug('main-window', 'BrowserWindow:resize');
        });

        /** @listens Electron~WebContents#on */
        this.webContents.on('will-navigate', (event, url) => {
            logger.debug('main-window', 'WebContents:will-navigate');

            event.preventDefault();
            if (url) {
                shell.openExternal(url);
            }
        });

        /** @listens Electron~WebContents#on */
        this.webContents.on('dom-ready', () => {
            logger.debug('main-window', 'WebContents:dom-ready');

            // DEBUG
            if (isDebug) {
                this.webContents.openDevTools({ mode: 'detach' });
            }
            if (isLivereload) {
                electronConnect.client.create();
            }
        });

        this.loadURL(appUrl);

        return this;
    }
}


/**
 * Create Window
 */
let createMainWindow = () => {
    logger.debug('main-window', 'createMainWindow()');

    if (mainWindow) { return; }

    mainWindow = new MainWindow();
};

/**
 * Get Window
 */
let getMainWindow = () => {
    logger.debug('main-window', 'getMainWindow()');

    return mainWindow;
};


/** @listens Electron.App#on */
app.on('activate', () => {
    logger.debug('main-window', 'App:activate');

    mainWindow.show();
});

/** @listens Electron.App#on */
app.on('ready', () => {
    logger.debug('main-window', 'App:ready');

    createMainWindow();
});


/**
 * @exports
 */
module.exports = getMainWindow();
