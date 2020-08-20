'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const events = require('events')

/**
 * Modules (Electron)
 * @constant
 */
const electron = require('electron')
const { app, BrowserWindow, nativeTheme, session } = electron

/**
 * Modules (Local)
 * @constant
 */
const appManifest = require('app/scripts/main-process/components/globals').appManifest


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
 * Electron 9 webSecurity option no longer disables CORS
 * @see {@link https://github.com/electron/electron/issues/23664}
 */
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')

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
process.platform === 'win32' ? app.setAppUserModelId(appManifest.appId) : void 0

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
 * Modules (Third party)
 * @constant
 */
const logger = require('@sidneys/logger')({ write: true })
/* eslint-disable no-unused-vars */
const debugService = require('@sidneys/electron-debug-service')
const updaterService = require('@sidneys/electron-updater-service')
const powerService = require('@sidneys/electron-power-service')
/* eslint-enable */

/**
 * Modules (Local)
 * @constant
 */
/* eslint-disable no-unused-vars */
const appMenu = require('app/scripts/main-process/menus/app-menu')
const dialogProvider = require('@sidneys/electron-dialog-provider')
const mainWindow = require('app/scripts/main-process/windows/main-window')
const configurationManager = require('app/scripts/main-process/managers/configuration-manager')
const trayMenu = require('app/scripts/main-process/menus/tray-menu')
const snoozerService = require('app/scripts/main-process/services/snoozer-service')
/* eslint-enable */


/**
 * Enforce single application instance
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
app.on('second-instance', () => {
    logger.warn('Additional application instance detected:', app.getPath('exe'))
    logger.warn('Restoring primary window..')

    BrowserWindow.getAllWindows().forEach((browserWindow) => {
        browserWindow.restore()
        app.focus()
    })
})

/**
 * @listens Electron.App:ready
 */
app.once('ready', () => {
    logger.debug('app#ready')

    /**
     * HOTFIX
     * Register file:// protocol for default session
     * @see {@link https://www.electronjs.org/docs/api/protocol}
     * @see {@link https://github.com/electron/electron/issues/23757#issuecomment-640146333}
     */
    const appSession = session.fromPartition('persist:app')
    appSession.protocol.registerFileProtocol('file', (request, callback) => {
        const filePath = decodeURI(request.url.replace('file:///', ''))
        callback(filePath)
    })
})


/**
 * @listens Electron.nativeTheme:updated
 */
nativeTheme.on('updated', () => {
    logger.debug('nativeTheme#updated', 'nativeTheme.themeSource', nativeTheme.themeSource)
})

