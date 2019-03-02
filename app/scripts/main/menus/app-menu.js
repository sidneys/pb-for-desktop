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
const { app, Menu, shell, webContents } = require('electron')

/**
 * Modules
 * External
 * @constant
 */
const Appdirectory = require('appdirectory')
const isDebug = require('@sidneys/is-env')('debug')
const logger = require('@sidneys/logger')({ write: false })

/**
 * Modules
 * Internal
 * @constant
 */
const platformTools = require('@sidneys/platform-tools')


/**
 * Application
 * @constant
 * @default
 */
const appName = global.manifest.name
const appProductName = global.manifest.productName
const appHomepage = global.manifest.homepage

/**
 * Filesystem
 * @constant
 * @default
 */
const logFileExtension = 'log'
const logDirectoryName = appProductName || appName
const logFileTitle = appProductName || appName
const logDirectory = (new Appdirectory(logDirectoryName)).userLogs()
const logFilePath = path.join(logDirectory, `${logFileTitle}.${logFileExtension}`)


/**
 * App Menu Template
 * @function
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
let getAppMenuTemplate = () => {
    let template = [
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CommandOrControl+Z',
                    role: 'undo'
                },
                {
                    label: 'Redo',
                    accelerator: 'Shift+CommandOrControl+Z',
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Cut',
                    accelerator: 'CommandOrControl+X',
                    role: 'cut'
                },
                {
                    label: 'Copy',
                    accelerator: 'CommandOrControl+C',
                    role: 'copy'
                },
                {
                    label: 'Paste',
                    accelerator: 'CommandOrControl+V',
                    role: 'paste'
                },
                {
                    label: 'Select All',
                    accelerator: 'CommandOrControl+A',
                    role: 'selectall'
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Full Screen',
                    accelerator: (() => {
                        if (process.platform === 'darwin') {
                            return 'Ctrl+Command+F'
                        } else {
                            return 'F11'
                        }
                    })(),
                    click(item, focusedWindow) {
                        if (focusedWindow) {
                            focusedWindow.setFullScreen(!focusedWindow.isFullScreen())
                        }
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Reset Zoom',
                    accelerator: 'CommandOrControl+0',
                    click() {
                        webContents.getAllWebContents().forEach((contents) => {
                            contents.send('zoom', 'reset')
                        })
                    }
                },
                {
                    label: 'Zoom In',
                    accelerator: 'CommandOrControl+Plus',
                    click() {
                        webContents.getAllWebContents().forEach((contents) => {
                            contents.send('zoom', 'in')
                        })
                    }
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CommandOrControl+-',
                    click() {
                        webContents.getAllWebContents().forEach((contents) => {
                            contents.send('zoom', 'out')
                        })
                    }
                },
                {
                    visible: isDebug,
                    type: 'separator'
                },
                {
                    label: 'Reload',
                    accelerator: 'CommandOrControl+R',
                    click(item, focusedWindow) {
                        if (focusedWindow) {
                            focusedWindow.reload()
                        }
                    }
                },
                {
                    label: 'Toggle Developer Tools',
                    accelerator: (() => {
                        return process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I'
                    })(),
                    click(item, focusedWindow) {
                        if (focusedWindow) {
                            focusedWindow.toggleDevTools()
                        }
                    }
                }
            ]
        },
        {
            label: 'Window',
            role: 'window',
            submenu: [
                {
                    label: 'Minimize',
                    accelerator: 'CommandOrControl+M',
                    role: 'minimize'
                },
                {
                    label: 'Close',
                    accelerator: 'CommandOrControl+W',
                    role: 'close'
                }
            ]
        },
        {
            label: 'Help',
            role: 'help',
            submenu: [
                {
                    label: 'Learn More',
                    click() {
                        shell.openExternal(appHomepage)
                    }
                }
            ]
        }
    ]

    if (platformTools.isMacOS) {
        template.unshift({
            label: appProductName,
            submenu: [
                {
                    label: `About ${appProductName}`,
                    role: 'about'
                },
                {
                    type: 'separator'
                },
                {
                    label: `Open Log...`,
                    click() {
                        shell.openItem(logFilePath)
                    }
                },
                {
                    label: `Restart in Developer Mode...`,
                    click() {
                        app.relaunch({ args: process.argv.slice(1).concat([ '--debug' ]) })
                        app.quit()
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Services',
                    role: 'services',
                    submenu: []
                },
                {
                    type: 'separator'
                },
                {
                    label: `Hide ${appProductName}`,
                    accelerator: 'Command+H',
                    role: 'hide'
                },
                {
                    label: 'Hide Others',
                    accelerator: 'Command+Shift+H',
                    role: 'hideothers'
                },
                {
                    label: 'Show All',
                    role: 'unhide'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Quit',
                    accelerator: 'Command+Q',
                    click() {
                        app.quit()
                    }
                }
            ]
        })
    }

    return template
}


/**
 * Init
 */
let init = () => {
    logger.debug('init')

    // Ensure single instance
    if (!global.appMenu) {
        global.appMenu = Menu.buildFromTemplate(getAppMenuTemplate())
        Menu.setApplicationMenu(global.appMenu)
    }
}


/**
 * @listens Electron.App#Event:ready
 */
app.on('ready', () => {
    logger.debug('app#ready')

    init()
})


/**
 * @exports
 */
module.exports = global.appMenu
