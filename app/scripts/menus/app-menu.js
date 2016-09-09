'use strict';


/**
 * Modules
 * Node
 * @global
 * @const
 */
const path = require('path');

/**
 * Modules
 * External
 * @global
 * @const
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Electron
 * @global
 * @const
 */
const { app, Menu, shell }  = require('electron');

/**
 * Modules
 * Internal
 * @global
 * @const
 */
const packageJson = require(path.join(appRootPath, 'package.json'));


/**
 * App
 * @global
 * @constant
 */
let appName = packageJson.productName || packageJson.name;
let appHomepage = packageJson.homepage;

/**
 * @global
 */
let appMenu;


/**
 * App Menu Template
 */
let appMenuTemplate = () => {
    const template = [
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
                    click: function(item, focusedWindow) {
                        if (focusedWindow) {focusedWindow.reload();}
                    }
                },
                {
                    label: 'Toggle Full Screen',
                    accelerator: (function() {
                        if (process.platform === 'darwin') {return 'Ctrl+Command+F';}
                        else {return 'F11';}
                    })(),
                    click: function(item, focusedWindow) {
                        if (focusedWindow) {focusedWindow.setFullScreen(!focusedWindow.isFullScreen());}
                    }
                },
                {
                    label: 'Toggle Developer Tools',
                    accelerator: (function() {
                        if (process.platform === 'darwin') {return 'Alt+Command+I';}
                        else {return 'Ctrl+Shift+I';}
                    })(),
                    click: function(item, focusedWindow) {
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
                    click: function() { shell.openExternal(appHomepage); }
                }
            ]
        }
    ];

    if (process.platform === 'darwin') {
        template.unshift({
            label: appName,
            submenu: [
                {
                    label: 'About ' + appName,
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
                    label: 'Hide ' + appName,
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
                    click: function() { app.quit(); }
                }
            ]
        });
        const windowMenu = template.find(function(m) { return m.role === 'window'; });
        if (windowMenu) {
            windowMenu.submenu.push(
                {
                    type: 'separator'
                },
                {
                    label: 'Bring All to Front',
                    role: 'front'
                }
            );
        }
    }

    return template;
};

/**
 *  Create the AppMenu
 */
let createAppMenu = function() {
    appMenu = Menu.buildFromTemplate(appMenuTemplate());
    Menu.setApplicationMenu(appMenu);

    return appMenu;
};

app.on('ready', () => {
    createAppMenu();
});

/**
 * @exports
 */
module.exports = {
    create: createAppMenu
};
