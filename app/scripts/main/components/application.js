'use strict'


/**
 * Modules
 * Node
 * @constant
 */
const events = require('events')
const path = require('path')

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron')
const { app, BrowserWindow, systemPreferences } = electron

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
 * Hotfix
 * Window Translucency
 * @see {@link https://github.com/electron/electron/issues/2170}
 */
// app.disableHardwareAcceleration()

/**
 * Hotfix
 * EventEmitter Memory Leak
 * @see {@link https://stackoverflow.com/questions/9768444/possible-eventemitter-memory-leak-detected}
 */
events.EventEmitter.defaultMaxListeners = Infinity

/**
 * Hotfix
 * Chrome 66 Autoplay Policy
 * @see {@link https://github.com/electron/electron/issues/13525}
 */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

/**
 * Hotfix
 * Electron Security Warning
 * @see {@link https://stackoverflow.com/questions/48854265/why-do-i-see-an-electron-security-warning-after-updating-my-electron-project-t}
 */
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

/**
 * Hotfix
 * Notification API not working (Windows)
 * @see {@link https://github.com/electron/electron/issues/10864}
 */
if (platformTools.isWindows) {
    app.setAppUserModelId(global.manifest.appId)
}

/**
 * Hotfix
 * Missing App Indicator (Linux)
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
 * Ensure single instance
 */
if (!app.requestSingleInstanceLock()) {
    logger.warn('Additional application instance detected:', app.getPath('exe'))
    logger.warn('Exiting additional instance.')

    app.quit()

    return
}

/**
 * @listens Electron.App#second-instance
 */
app.on('second-instance', (event, commandLine, workingDirectory) => {
    logger.warn('Additional application instance detected:', app.getPath('exe'))
    logger.warn('Restoring primary window..')

    BrowserWindow.getAllWindows().forEach((browserWindow) => {
        browserWindow.restore()
        app.focus()
    })
})

/**
 * @listens Electron.App#before-quit
 */
app.on('before-quit', () => {
    logger.debug('app#before-quit')

    global.state.isQuitting = true
})

/**
 * @listens Electron.App#before-quit-for-update
 */
app.on('before-quit-for-update', () => {
    logger.debug('app#before-quit-for-update')

    global.state.isQuitting = true
})

/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready')
})


/**
 * @listens Electron.systemPreferences#appearance-changed
 */
systemPreferences.on('appearance-changed', (newAppearance) => {
    logger.debug('systemPreferences#appearance-changed', 'newAppearance:', newAppearance)
})
