'use strict'


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path')

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron')
const { app, BrowserWindow } = electron

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')
const logger = require('@sidneys/logger')({ write: true })
const platformTools = require('@sidneys/platform-tools')
/* eslint-disable no-unused-vars */
const debugService = require('@sidneys/electron-debug-service')
const updaterService = require('@sidneys/electron-updater-service')
const powerService = require('@sidneys/electron-power-service')
/* eslint-enable */

/**
 * Modules
 * Configuration
 */
appRootPath.setPath(path.join(__dirname, '..', '..', '..', '..'))

/**
 * Modules
 * Internal
 * @constant
 */
/* eslint-disable no-unused-vars */
const globals = require(path.join(appRootPath['path'], 'app', 'scripts', 'main', 'components', 'globals'))
/* eslint-enable */

/**
 * Hotfix: Windows
 * @see {@link https://github.com/electron/electron/issues/10864}
 */
if (platformTools.isWindows) {
    app.setAppUserModelId(global.manifest.appId)
}

/**
 * Hotfix: Linux
 * @see {@link https://github.com/electron/electron/issues/10427}
 */
if (platformTools.isLinux) {
    if (process.env.XDG_DATA_DIRS.includes('plasma')) {
        process.env.XDG_CURRENT_DESKTOP = 'Unity'
    }
}

/**
 * Modules
 * Internal
 * @constant
 */
/* eslint-disable no-unused-vars */
const appMenu = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'menus', 'app-menu'))
const mainWindow = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'windows', 'main-window'))
const configurationManager = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'managers', 'configuration-manager'))
const trayMenu = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'menus', 'tray-menu'))
const snoozerService = require(path.join(appRootPath.path, 'app', 'scripts', 'main', 'services', 'snoozer-service'))
/* eslint-enable */


/**
 * @listens Electron.App#before-quit
 */
app.on('before-quit', () => {
    logger.debug('app#before-quit')

    global.state.isQuitting = true
})

/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready')
})

/**
 * Ensure single instance
 */
const isSecondInstance = app.makeSingleInstance(() => {
    logger.debug('isSecondInstance', 'primary instance')

    logger.warn('Multiple application instances detected', app.getPath('exe'))
    logger.warn('Multiple application instances detected', 'Restoring primary application instance')

    BrowserWindow.getAllWindows().forEach((browserWindow) => {
        browserWindow.restore()
        app.focus()
    })
})

if (isSecondInstance) {
    logger.debug('isSecondInstance', 'secondary instance')

    logger.warn('Multiple application instances detected', app.getPath('exe'))
    logger.warn('Multiple application instances detected', 'Shutting down secondary application instances')

    process.exit(0)
}
