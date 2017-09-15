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
const { app, webContents } = electron || electron.remote;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
/* eslint-disable no-unused-vars */
const filesize = require('filesize');
const tryRequire = require('try-require');
/* eslint-enable */

/**
 * Modules
 * Internal
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-env'))('debug');
const isLivereload = require(path.join(appRootPath, 'lib', 'is-env'))('livereload');
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

    let timeout = setTimeout(() => {
        webContents.getAllWebContents().forEach((contents) => {
            /**
             * Open Developer Tools
             */
            if (isDebug) {
                logger.info('opening developer tools:', `"${contents.getURL()}"`);

                contents.openDevTools({ mode: 'undocked' });
            }

            /**
             * Start Live Reload
             */
            if (isLivereload) {
                logger.info('starting live reload:', `"${contents.getURL()}"`);

                tryRequire('electron-connect')['client'].create();
            }

            /**
             * Show Caches
             */
            contents.session.getCacheSize((size) => {
                logger.debug('webContents', 'id', contents.id, 'url', contents.getURL());
                logger.debug('webContents', 'cache', filesize(size));
            });
        });
        clearTimeout(timeout);
    }, defaultTimeout);
};


/**
 * @listens Electron.App#Event:ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    init();
});
