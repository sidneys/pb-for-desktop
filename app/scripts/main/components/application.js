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
appRootPath.setPath(path.join(__dirname, '..', '..', '..', '..'))

/**
 * Modules
 * Internal
 * @constant
 */
require(path.join(appRootPath['path'], 'app', 'scripts', 'main', 'components', 'globals'))


/**
 * HOTFIX
 * Window Translucency
 * @see {@link https://github.com/electron/electron/issues/2170}
 */
app.disableHardwareAcceleration()

/**
 * HOTFIX
 * Chrome 66 Autoplay Policy
 * @see {@link https://github.com/electron/electron/issues/13525}
 */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

/**
 * HOTFIX
 * Audio Playback
 * @see {@link https://github.com/electron/electron/issues/12048}
 */
// app.commandLine.appendSwitch('disable-renderer-backgrounding')

/**
 * HOTFIX
 * Electron Security Warning
 * @see {@link https://stackoverflow.com/questions/48854265}
 */
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

/**
 * HOTFIX
 * EventEmitter Memory Leak
 * @see {@link https://stackoverflow.com/questions/9768444}
 */
events.EventEmitter.defaultMaxListeners = Infinity

/**
 * HOTFIX (Windows)
 * Notification API not working
 * @see {@link https://github.com/electron/electron/issues/10864}
 */
process.platform === 'win32' ? app.setAppUserModelId(global.manifest.appId) : void 0

/**
 * HOTFIX (Linux)
 * Missing App Indicator
 * @see {@link https://github.com/electron/electron/issues/10427}
 */
if (process.platform === 'linux') {
    if (process.env.XDG_DATA_DIRS.includes('plasma')) {
        process.env.XDG_CURRENT_DESKTOP = 'Unity'
    }
}


/**
 * Modules
 * External
 * @constant
 */
const logger = require('@sidneys/logger')({ write: true })
/* eslint-disable no-unused-vars */
const debugService = require('@sidneys/electron-debug-service')
const updaterService = require('@sidneys/electron-updater-service')
const powerService = require('@sidneys/electron-power-service')
/* eslint-enable */

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
 * @listens Electron.App:second-instance
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
 * @listens Electron.App:before-quit
 */
app.on('before-quit', () => {
    logger.debug('app#before-quit')

    global.state.isQuitting = true
})

/**
 * @listens Electron.App:before-quit-for-update
 */
app.on('before-quit-for-update', () => {
    logger.debug('app#before-quit-for-update')

    global.state.isQuitting = true
})

/**
 * @listens Electron.App:ready
 */
app.once('ready', () => {
    logger.debug('app#ready')
})


/**
 * @listens Electron.systemPreferences:appearance-changed
 */
systemPreferences.on('appearance-changed', (newAppearance) => {
    logger.debug('systemPreferences#appearance-changed', 'newAppearance:', newAppearance)
})
