'use strict';


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
const logger = require('@sidneys/logger')({ write: true });


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
        logger.log('electron.powerMonitor#suspend');
    });

    /**
     * @listens Electron.powerMonitor#resume
     */
    electron.powerMonitor.on('resume', () => {
        logger.log('electron.powerMonitor#resume');

        let timeout = setTimeout(() => {
            logger.log('electron.powerMonitor#resume', 'relaunching app');

            clearTimeout(timeout);

            app.relaunch();
            app.exit();
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
