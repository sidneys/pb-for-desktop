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
const { app, BrowserWindow, Menu, shell } = require('electron');

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
//const isDebug = require(path.join(appRootPath, 'lib', 'is-env'))('debug');
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: false });
const packageJson = require(path.join(appRootPath, 'package.json'));


/**
 * Application
 * @constant
 * @default
 */
const appProductName = packageJson.productName || packageJson.name;
const appHomepage = packageJson.homepage;


/**
 * @instance
 */
let appMenu = {};

/**
 * App Menu Template
 * @function
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
                            return 'Ctrl+Command+F';
                        }
                        else {
                            return 'F11';
                        }
                    })(),
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {
                            focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                        }
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Actual Size',
                    accelerator: 'CommandOrControl+0',
                    click: () => {
                        BrowserWindow.getFocusedWindow().webContents.executeJavaScript(`webFrame.setZoomLevel(0);`).then(() => {});
                    }
                },
                {
                    label: 'Zoom In',
                    accelerator: 'CommandOrControl+Plus',
                    click: () => {
                        BrowserWindow.getFocusedWindow().webContents.executeJavaScript(`webFrame.setZoomLevel(webFrame.getZoomLevel() + 1);`).then(() => {});
                    }
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CommandOrControl+-',
                    click: () => {
                        BrowserWindow.getFocusedWindow().webContents.executeJavaScript(`webFrame.setZoomLevel(webFrame.getZoomLevel() - 1);`).then(() => {});
                    }
                },
                {
                    //visible: isDebug,
                    type: 'separator'
                },
                {
                    //visible: isDebug,
                    label: 'Reload',
                    accelerator: 'CommandOrControl+R',
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {
                            focusedWindow.reload();
                        }
                    }
                },
                {
                    //visible: isDebug,
                    label: 'Toggle Developer Tools',
                    accelerator: (() => {
                        if (process.platform === 'darwin') {
                            return 'Alt+Command+I';
                        }
                        else {
                            return 'Ctrl+Shift+I';
                        }
                    })(),
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {
                            focusedWindow.toggleDevTools();
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
                    click: () => {
                        shell.openExternal(appHomepage);
                    }
                }
            ]
        }
    ];

    if (process.platform === 'darwin') {
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
                    click: () => {
                        app.quit();
                    }
                }
            ]
        });
    }

    return template;
};


/**
 * @listens Electron.App#ready
 */
app.on('ready', () => {
    logger.debug('app#ready');

    appMenu = Menu.buildFromTemplate(getAppMenuTemplate());
    Menu.setApplicationMenu(appMenu);
});


/**
 * @exports
 */
module.exports = appMenu;
