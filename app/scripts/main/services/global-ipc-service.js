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
const electron = require('electron');
const { ipcMain, webContents } = electron;

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


/**
 * Global IPC relay Messaging (relays messages to all renderers)
 * @listens ipcMain#global
 */
ipcMain.on('global', (event, channel, args) => {
    logger.debug('ipcMain#global', 'global');

    /**
     * @fires ipcMain#global
     */
    webContents.getAllWebContents().forEach((contents) => {
        contents.send('global', channel, args);
    });
});
