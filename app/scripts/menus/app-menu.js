'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Electron
 * @constant
 */
const { app, Menu, shell } = require('electron');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
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
 *
 * @private
 */
let getAppMenuTemplate = () => {
    let template = [
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    role: 'undo'
                },
                {
                    label: 'Redo',
                    accelerator: 'Shift+CmdOrCtrl+Z',
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    role: 'cut'
                },
                {
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    role: 'copy'
                },
                {
                    label: 'Paste',
                    accelerator: 'CmdOrCtrl+V',
                    role: 'paste'
                },
                {
                    label: 'Select All',
                    accelerator: 'CmdOrCtrl+A',
                    role: 'selectall'
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Reload',
                    accelerator: 'CmdOrCtrl+R',
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {focusedWindow.reload();}
                    }
                },
                {
                    label: 'Toggle Full Screen',
                    accelerator: (() => {
                        if (process.platform === 'darwin') {return 'Ctrl+Command+F';}
                        else {return 'F11';}
                    })(),
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {focusedWindow.setFullScreen(!focusedWindow.isFullScreen());}
                    }
                },
                {
                    label: 'Toggle Developer Tools',
                    accelerator: (() => {
                        if (process.platform === 'darwin') {return 'Alt+Command+I';}
                        else {return 'Ctrl+Shift+I';}
                    })(),
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {focusedWindow.toggleDevTools();}
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
                    accelerator: 'CmdOrCtrl+M',
                    role: 'minimize'
                },
                {
                    label: 'Close',
                    accelerator: 'CmdOrCtrl+W',
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
                    click: () => { shell.openExternal(appHomepage); }
                }
            ]
        }
    ];

    if (process.platform === 'darwin') {
        template.unshift({
            label: appProductName,
            submenu: [
                {
                    label: 'About ' + appProductName,
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
                    label: 'Hide ' + appProductName,
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
                    click: () => { app.quit(); }
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
