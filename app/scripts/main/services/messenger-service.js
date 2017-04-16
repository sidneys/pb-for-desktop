'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { app, dialog } = electron || electron.remote;

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path')['path'];
const fileType = require('file-type');
const readChunk = require('read-chunk');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * Application
 * @constant
 * @default
 */
const appProductName = packageJson.productName || packageJson.name;

/**
 * @constant
 * @default
 */
const defaultTimeout = 250;


/**
 * Display Message Box
 * @param {String} title - Title
 * @param {String} message - Message
 * @param {Array} buttonList - Buttons
 * @param {Boolean} isError - Buttons
 * @param {Function=} callback - Callback
 * @function
 */
let displayDialog = function(title, message, buttonList, isError, callback = () => {}) {
    let dialogTitle = title || appProductName;
    let dialogMessage = message || title;

    let timeout = setTimeout(() => {
        dialog.showMessageBox({
            type: isError ? 'error' : 'warning',
            buttons: buttonList || ['OK'],
            defaultId: 0,
            title: dialogTitle,
            message: dialogTitle,
            detail: os.EOL + dialogMessage + os.EOL
        }, (response) => {
            logger.debug('displayDialog', `title: '${title}' message: '${message}' response: '${response} (${buttonList[response]})'`);
            callback(response);
        });

        clearTimeout(timeout);
    }, defaultTimeout);
};

/**
 * Validate Files by Mimetype
 * @function
 */
let validateFileType = function(file, acceptedFiletype, callback) {
    logger.debug('validateFileType', file, acceptedFiletype);

    let filePath = path.normalize(file.toString());

    fs.stat(filePath, function(err) {
        if (err) { return callback(err); }

        let detectedType = fileType(readChunk.sync(filePath, 0, 262)).mime;
        let isValidFile = _.startsWith(detectedType, acceptedFiletype);

        if (!isValidFile) {
            logger.error('validFileType', detectedType);

            return callback(new Error(`Filetype incorrect: ${detectedType}`));
        }

        callback(null, filePath);
    });
};


/**
 * Info
 * @param {String=} title - Title
 * @param {String=} message - Message
 * @param {Function=} callback - Callback
 * @function
 *
 * @public
 */
let showInfo = function(title, message, callback = () => {}) {
    return displayDialog(title, message, ['Dismiss'], false, callback);
};


/**
 * Info
 * @param {String=} title - Title
 * @param {String} fileType - audio,video
 * @param {String=} folder - Initial lookup folder
 * @param {Function=} callback - Callback
 * @function
 *
 * @public
 */
let openFile = function(title, fileType, folder, callback = () => {}) {
    let dialogTitle = title || appProductName;
    let initialFolder = folder || app.getPath(name);

    let fileTypes = {
        image: ['jpg', 'jpeg', 'bmg', 'png', 'tif'],
        audio: ['aiff', 'm4a', 'mp3', 'mp4', 'wav']
    };


    if (!fileTypes[fileType]) {
        return;
    }

    logger.debug('initialFolder', initialFolder);
    logger.debug('dialogTitle', dialogTitle);
    logger.debug('title', title);
    logger.debug('fileType', fileType);


    dialog.showOpenDialog({
        title: dialogTitle,
        properties: ['openFile', 'showHiddenFiles'],
        defaultPath: initialFolder,
        filters: [{ name: 'Sound', extensions: fileTypes[fileType] }]
    }, (filePath) => {

        if (!filePath) {
            logger.error('showOpenDialog', 'filepath required');
            return callback(new Error(`Filepath missing`));
        }

        validateFileType(filePath, fileType, function(err, filePath) {
            if (err) {
                return displayDialog(`Incompatible file.${os.EOL}`, `Compatible formats are: ${fileTypes[fileType]}`, ['Dismiss'], false, () => {
                    logger.error('validateFileType', err);
                    callback(new Error(`File content error: ${filePath}`));
                });
            }

            callback(null, filePath);
        });
    });
};

/**
 * Yes/No
 * @param {String=} title - Title
 * @param {String=} message - Error Message
 * @param {Function=} callback - Callback
 * @function
 *
 * @public
 */
let showQuestion = function(title, message, callback = () => {}) {
    app.focus();

    return displayDialog(title, message, ['Yes', 'No'], false, callback);
};

/**
 * Error
 * @param {String} message - Error Message
 * @param {Function=} callback - Callback
 * @function
 *
 * @public
 */
let showError = function(message, callback = () => {}) {
    // Add Quit button
    callback = (result) => {
        if (result === 2) { return app.quit(); }
        return callback;
    };

    if (platformHelper.isMacOS) {
        app.dock.bounce('critical');
    }

    app.focus();

    return displayDialog('Error', message, ['Cancel', 'OK', `Quit ${appProductName}`], true, callback);
};


/**
 * @exports
 */
module.exports = {
    openFile: openFile,
    showError: showError,
    showInfo: showInfo,
    showQuestion: showQuestion
};
