'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const { app, dialog } = require('electron');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path').path;
const fileType = require('file-type');
const readChunk = require('read-chunk');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * App
 * @global
 * @constant
 */
const appProductName = packageJson.productName || packageJson.name;

/**
 * @global
 * @constant
 */
const defaultDelay = 1000;


/**
 * Display Message Box
 * @param {String} title - Title
 * @param {String} message - Message
 * @param {Array} buttonList - Buttons
 * @param {Boolean} isError - Buttons
 * @param {Function=} callback - Callback
 */
let displayDialog = function(title, message, buttonList, isError, callback) {
    let cb = callback || function() {};
    let dialogTitle = title || appProductName;
    let dialogMessage = message || title;

    let messageTimeout = setTimeout(function() {
        dialog.showMessageBox({
            type: isError ? 'error' : 'warning',
            buttons: buttonList || ['OK'],
            defaultId: 0,
            title: dialogTitle,
            message: dialogTitle,
            detail: os.EOL + dialogMessage + os.EOL
        }, (response) => {
            logger.log('displayDialog', `title: '${title}' message: '${message}' response: '${response} (${buttonList[response]})'`);
            cb(response);
        });

        clearTimeout(messageTimeout);
    }, defaultDelay);
};

/**
 * Validate Files by Mimetype
 */
let validateFileType = function(file, acceptedFiletype, cb) {
    logger.debug('messenger-service', 'validateFileType()', file, acceptedFiletype);

    let filePath = path.normalize(file.toString());

    fs.stat(filePath, function(err) {
        if (err) { return cb(err); }

        let detectedType = fileType(readChunk.sync(filePath, 0, 262)).mime;
        let isValidFile = _.startsWith(detectedType, acceptedFiletype);

        if (!isValidFile) {
            logger.error('messenger-service', 'validFileType()', detectedType);

            return cb(new Error(`Filetype incorrect: ${detectedType}`));
        }

        cb(null, filePath);
    });
};


/**
 * Info
 * @param {String=} title - Title
 * @param {String=} message - Message
 * @param {Function=} callback - Callback
 */
let showInfo = function(title, message, callback) {
    let cb = callback || function() {};

    return displayDialog(title, message, ['Dismiss'], false, cb);
};


/**
 * Info
 * @param {String=} title - Title
 * @param {String} fileType - audio,video
 * @param {String=} folder - Initial lookup folder
 * @param {Function=} callback - Callback
 */
let openFile = function(title, fileType, folder, callback) {
    let cb = callback || function() {};
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
            logger.error('messenger-service', 'showOpenDialog()', 'filepath required');
            return cb(new Error(`Filepath missing`));
        }

        validateFileType(filePath, fileType, function(err, filePath) {
            if (err) {
                return displayDialog(`Incompatible file.${os.EOL}`, `Compatible formats are: ${fileTypes[fileType]}`, ['Dismiss'], false, () => {
                    logger.error('messenger-service', 'validateFileType()', err);
                    cb(new Error(`File content error: ${filePath}`));
                });
            }

            cb(null, filePath);
        });
    });
};

/**
 * Yes/No
 * @param {String=} title - Title
 * @param {String=} message - Error Message
 * @param {Function=} callback - Callback
 */
let showQuestion = function(title, message, callback) {
    let cb = callback || function() {};

    return displayDialog(title, message, ['Yes', 'No'], false, cb);
};

/**
 * Error
 * @param {String} message - Error Message
 * @param {Function=} callback - Callback
 */
let showError = function(message, callback) {
    let cb = callback || function() {};

    // Add Quit button
    cb = (result) => {
        if (result === 2) { return app.quit(); }
        return cb;
    };

    if (platformHelper.isMacOS) {
        app.dock.bounce('critical');
    }

    return displayDialog('Error', message, ['Cancel', 'OK', `Quit ${appProductName}`], true, cb);
};


/**
 * @exports
 */
module.exports = {
    showError: showError,
    showInfo: showInfo,
    openFile: openFile,
    showQuestion: showQuestion
};
