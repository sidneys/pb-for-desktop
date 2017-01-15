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
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const settings = require(path.join(appRootPath, 'app', 'scripts', 'configuration', 'settings'));
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const isLivereload = require(path.join(appRootPath, 'lib', 'is-livereload'));


/**
 * App
 * @global
 * @constant
 */
const appProductName = packageJson.productName || packageJson.name;
const appUrl = 'file://' + path.join(appRootPath, 'app', 'html', 'main.html');

/**
 * Paths
 * @global
 */
const appIcon = path.join(appRootPath, 'icons', platformHelper.type, 'icon' + platformHelper.iconImageExtension(platformHelper.type));


/**
 * @global
 */
let mainWindow = {};


/**
 * MainWindow
 * @class
 * @extends Electron.BrowserWindow
 */
class MainWindow extends BrowserWindow {
    constructor() {
        super({
            acceptFirstMouse: true,
            autoHideMenuBar: true,
            backgroundColor: '#4AB367',
            frame: !platformHelper.isMacOS,
            fullscreenable: true,
            icon: appIcon,
            minHeight: 512,
            minWidth: 256,
            show: false,
            thickFrame: true,
            title: appProductName,
            titleBarStyle: platformHelper.isMacOS ? 'hidden-inset' : 'default',
            webPreferences: {
                nodeIntegration: true,
                allowDisplayingInsecureContent: true,
                experimentalFeatures: true,
                allowRunningInsecureContent: true,
                webSecurity: false,
                webaudio: true
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

            settings.settings.set('internal.isVisible', true).then(() => {});
        });

        /** @listens Electron.BrowserWindow#on */
        this.on('hide', () => {
            logger.debug('main-window', 'BrowserWindow:hide');

            settings.settings.set('internal.isVisible', false).then(() => {});
        });

        /** @listens Electron.BrowserWindow#on */
        this.on('move', () => {
            logger.debug('main-window', 'BrowserWindow:move');

            settings.settings.setSync('internal.windowBounds', BrowserWindow.getAllWindows()[0].getBounds());
        });

        /** @listens Electron.BrowserWindow#on */
        this.on('resize', () => {
            logger.debug('main-window', 'BrowserWindow:resize');

            settings.settings.setSync('internal.windowBounds', BrowserWindow.getAllWindows()[0].getBounds());
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

            if (settings.settings.getSync('internal.isVisible')) {
                this.show();
            } else {
                this.hide();
            }

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

/** @listens Electron.App#on */
app.on('activate', () => {
    logger.debug('main-window', 'App:activate');

    mainWindow.show();
});

/** @listens Electron.App#on */
app.on('ready', () => {
    logger.debug('main-window', 'App:ready');

    mainWindow = new MainWindow();
});


/**
 * @exports
 */
module.exports = mainWindow;
