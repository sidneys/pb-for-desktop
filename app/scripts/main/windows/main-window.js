'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { app, BrowserWindow, shell } = electron;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * Application
 * @constant
 * @default
 */
const appIcon = path.join(appRootPath, 'icons', platformHelper.type, 'icon' + platformHelper.iconImageExtension(platformHelper.type));
const appProductName = packageJson.productName || packageJson.name;
const appUrl = 'file://' + path.join(appRootPath, 'app', 'html', 'main.html');


/**
 * @instance
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
        logger.debug('init');

        /**
         * @listens Electron.BrowserWindow#close
         */
        this.on('close', ev => {
            logger.debug('MainWindow#close');

            if (!app.isQuitting) {
                ev.preventDefault();
                this.hide();
            }
        });

        /**
         * @listens Electron.BrowserWindow#show
         */
        this.on('show', () => {
            logger.debug('MainWindow#show');
        });

        /**
         * @listens Electron.BrowserWindow#hide
         */
        this.on('hide', () => {
            logger.debug('MainWindow#hide');
        });

        /**
         * @listens Electron.BrowserWindow#move
         */
        this.on('move', () => {
            logger.debug('MainWindow#move');
        });

        /**
         * @listens Electron.BrowserWindow#resize
         */
        this.on('resize', () => {
            logger.debug('MainWindow#resize');
        });

        /**
         * @listens Electron~WebContents#will-navigate
         */
        this.webContents.on('will-navigate', (event, url) => {
            logger.debug('MainWindow.webContents#will-navigate');

            event.preventDefault();
            if (url) {
                shell.openExternal(url);
            }
        });

        /**
         * @listens Electron~WebContents#dom-ready
         */
        this.webContents.on('dom-ready', () => {
            logger.debug('MainWindow.webContents#dom-ready');
        });

        this.loadURL(appUrl);

        return this;
    }
}


/**
 * Create Window
 */
let createMainWindow = () => {
    logger.debug('createMainWindow');

    if (mainWindow) { return; }

    mainWindow = new MainWindow();
};

/**
 * Get Window
 */
let getMainWindow = () => {
    logger.debug('getMainWindow');

    return mainWindow;
};


/**
 * @listens Electron.App#on
 */
app.on('activate', () => {
    logger.debug('app#activate');

    mainWindow.show();
});

/**
 * @listens Electron.App#on
 */
app.once('ready', () => {
    logger.debug('app#ready');

    createMainWindow();
});


/**
 * @exports
 */
module.exports = getMainWindow();
