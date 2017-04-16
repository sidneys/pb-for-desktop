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
const { app } = electron || electron.remote;

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
 * @constant
 * @default
 */
const defaultTimeout = 5000;


/**
 * Init
 */
let init = () => {
    logger.debug('init');

    /**
     * @listens Electron.powerMonitor#suspend
     */
    electron.powerMonitor.on('suspend', () => {
        logger.log('webview#suspend');
    });

    /**
     * @listens Electron.powerMonitor#resume
     */
    electron.powerMonitor.on('resume', () => {
        logger.log('webview#resume');

        let timeout = setTimeout(() => {
            logger.log('webview#resume', 'relaunching app');

            app.relaunch();
            app.exit();

            clearTimeout(timeout);
        }, defaultTimeout);
    });
};


/**
 * @listens Electron.App#ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    init();
});
