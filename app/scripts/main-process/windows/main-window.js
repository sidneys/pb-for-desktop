'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const path = require('path')
const url = require('url')

/**
 * Modules (Electron)
 * @constant
 */
const electron = require('electron')
const { app, BrowserWindow, shell } = electron

/**
 * Modules (Third party)
 * @constant
 */
const appRootPathDirectory = require('app-root-path').path
const logger = require('@sidneys/logger')({ write: true })
const platformTools = require('@sidneys/platform-tools')

/**
 * Modules (Local)
 * @constant
 */
const appManifest = require('app/scripts/main-process/components/globals').appManifest

/** @namespace global **/


/**
 * Filesystem
 * @constant
 * @default
 */
const windowHtml = path.join(appRootPathDirectory, 'app', 'html', 'main.html')

/**
 * Application
 * @constant
 * @default
 */
const windowTitle = appManifest.productName
const windowUrl = url.format({ protocol: 'file:', pathname: windowHtml })


/**
 * @class MainWindow
 * @property {Electron.BrowserWindow} browserWindow
 * @property {Boolean} allowQuit
 * @namespace Electron
 */
class MainWindow {
    /**
     * @constructor
     */
    constructor() {
        // Init BrowserWindow
        this.browserWindow = new BrowserWindow({
            acceptFirstMouse: true,
            autoHideMenuBar: true,
            // HOTFIX: Window Translucency, https://github.com//electron/electron/issues/2170
            // backgroundColor: platformTools.isMacOS ? void 0 : '#95A5A6',
            backgroundColor: platformTools.isMacOS ? void 0 : '#303030',
            darkTheme: platformTools.isLinux ? true : void 0,
            frame: true,
            hasShadow: platformTools.isMacOS ? true : void 0,
            show: false,
            thickFrame: platformTools.isWindows ? true : void 0,
            title: windowTitle,
            titleBarStyle: platformTools.isMacOS ? 'hiddenInset' : void 0,
            // HOTFIX: Window Translucency, https://github.com//electron/electron/issues/2170
            // transparent: true,
            transparent: platformTools.isMacOS,
            // HOTFIX: Crash on exit, https://github.com//electron/electron/issues/12726
            vibrancy: platformTools.isMacOS ? 'dark' : void 0,
            // vibrancy: void 0,
            webPreferences: {
                allowRunningInsecureContent: true,
                backgroundThrottling: false,
                contextIsolation: false,
                experimentalFeatures: true,
                enableRemoteModule: true,
                nodeIntegration: true,
                nodeIntegrationInSubFrames: true,
                nodeIntegrationInWorker: true,
                partition: 'persist:app',
                sandbox: false,
                scrollBounce: platformTools.isMacOS ? true : void 0,
                webaudio: true,
                webgl: true,
                webviewTag: true,
                webSecurity: false
            },
            x: void 0,
            y: void 0,
            height: void 0,
            width: void 0,
            minHeight: 256,
            minWidth: 128,
            zoomToPageWidth: true
        })

        // Init
        this.allowQuit = false

        this.init()
    }

    /**
     * Init
     */
    init() {
        logger.debug('init')

        /**
         * @listens Electron.BrowserWindow:close
         */
        this.browserWindow.on('close', (event) => {
            logger.debug('MainWindow.browserWindow:close')

            // Don't quit application when closing main window
            if (this.allowQuit === false) {
                event.preventDefault()
                this.browserWindow.hide()
            }
        })

        /**
         * @listens Electron.webContents:will-navigate
         */
        this.browserWindow.webContents.on('will-navigate', (event, url) => {
            logger.debug('MainWindow.browserWindow.webContents:will-navigate')

            // Handle external URLs
            if (url) {
                event.preventDefault()

                // Open URL
                shell.openExternal(url)
                    .then((result) => {
                        logger.debug('MainWindow.browserWindow.webContents:will-navigate', 'shell.openExternal', 'result:', result)
                    })
                    .catch((error) => {
                        logger.error('MainWindow.browserWindow.webContents:will-navigate', 'shell.openExternal', error)
                    })
            }
        })

        // Load HTML
        this.browserWindow.loadURL(windowUrl)
            .then((result) => {
                logger.debug('MainWindow.browserWindow#loadURL', 'result:', result)
            })
            .catch((error) => {
                logger.error('MMainWindow.browserWindow#loadURL', error)
            })
    }
}


/**
 * Show main Window when activating app
 * @listens Electron.App:activate
 */
app.on('activate', () => {
    logger.debug('app:activate')

    // Ensure single instance
    if (!global.mainWindow) { return }
    if (!global.mainWindow.browserWindow) { return }

    global.mainWindow.browserWindow.show()
})

/**
 * Allow to exit app when "quit" was directly called
 * @listens Electron.App:before-quit
 */
app.on('before-quit', () => {
    logger.debug('app:before-quit')

    // Ensure single instance
    if (!global.mainWindow) { return }

    global.mainWindow.allowQuit = true
})

/**
 * Init
 */
let init = () => {
    logger.debug('init')

    // Ensure single instance
    if (global.mainWindow) { return }

    global.mainWindow = new MainWindow()
}

/**
 * @listens Electron.App:ready
 */
app.once('ready', () => {
    logger.debug('app:ready')

    init()
})


/**
 * @exports
 */
module.exports = global.mainWindow
