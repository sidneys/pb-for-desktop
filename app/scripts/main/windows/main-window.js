'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');
const url = require('url');

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
const windowTitle = packageJson.productName || packageJson.name;
const windowIcon = path.join(appRootPath, 'icons', platformHelper.type, `icon${platformHelper.iconImageExtension(platformHelper.type)}`);
const windowUrl = url.format({ protocol: 'file:', pathname: path.join(appRootPath, 'app', 'html', 'main.html') });


/**
 * @instance
 */
let appWindow = {};


/**
 * AppWindow
 * @class
 * @extends Electron.BrowserWindow
 */
class AppWindow extends BrowserWindow {
    constructor() {
        super({
            acceptFirstMouse: true,
            autoHideMenuBar: true,
            backgroundColor: platformHelper.isMacOS ? '#0095A5A6' : '#95A5A6',
            frame: true,
            fullscreenable: true,
            icon: windowIcon,
            minHeight: 512,
            minWidth: 256,
            show: false,
            thickFrame: true,
            title: windowTitle,
            titleBarStyle: platformHelper.isMacOS ? 'hidden-inset' : 'default',
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
            logger.debug('AppWindow#close');

            if (!app.isQuitting) {
                ev.preventDefault();
                this.hide();
            }
        });

        /**
         * @listens Electron.BrowserWindow#show
         */
        this.on('show', () => {
            logger.debug('AppWindow#show');
        });

        /**
         * @listens Electron.BrowserWindow#hide
         */
        this.on('hide', () => {
            logger.debug('AppWindow#hide');
        });

        /**
         * @listens Electron.BrowserWindow#move
         */
        this.on('move', () => {
            logger.debug('AppWindow#move');
        });

        /**
         * @listens Electron.BrowserWindow#resize
         */
        this.on('resize', () => {
            logger.debug('AppWindow#resize');
        });

        /**
         * @listens Electron~WebContents#will-navigate
         */
        this.webContents.on('will-navigate', (event, url) => {
            logger.debug('AppWindow.webContents#will-navigate');

            event.preventDefault();
            if (url) {
                shell.openExternal(url);
            }
        });

        /**
         * @listens Electron~WebContents#dom-ready
         */
        this.webContents.on('dom-ready', () => {
            logger.debug('AppWindow.webContents#dom-ready');
        });

        this.loadURL(windowUrl);

        return this;
    }
}


/**
 * Create instance
 */
let create = () => {
    logger.debug('create');

    if (!(appWindow instanceof AppWindow)) {
        appWindow = new AppWindow();
    }
};


/**
 * @listens Electron.App#on
 */
app.on('activate', () => {
    logger.debug('app#activate');

    appWindow.show();
});

/**
 * @listens Electron.App#on
 */
app.once('ready', () => {
    logger.debug('app#ready');

    create();
});


/**
 * @exports
 */
module.exports = appWindow;
