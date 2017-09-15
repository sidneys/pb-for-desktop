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
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * Application
 * @constant
 * @default
 */
const appProductName = global.manifest.productName;

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
 * @param {function(*)} callback - Callback
 * @function
 */
let displayDialog = (title, message, buttonList, isError, callback = () => {}) => {
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
 * Info
 * @param {String=} title - Title
 * @param {String=} message - Message
 * @param {function(*)} callback - Callback
 * @return {function(*)|void}
 */
let showInfo = (title, message, callback = () => {}) => {
    return displayDialog(title, message, ['Dismiss'], false, callback);
};

/** @namespace fs.copy */
/** @namespace fs.exists */

/**
 * Validate Files by Mimetype
 * @param {String|String[]} filePath - File path
 * @param {String} targetType - Mimetype
 * @param {function(*)} callback - Callback
 */
let validateFileType = (filePath, targetType, callback = () => {}) => {
    logger.debug('validateFileType', filePath, targetType);

    filePath = path.normalize(filePath.toString());
    const fileExtension = path.extname(filePath).replace(/^\./, '');

    logger.debug('validateFileType', 'filePath', filePath);

    fs.stat(filePath, (error) => {
        if (error) {
            return callback(error);
        }

        const detectedType = fileType(readChunk.sync(filePath, 0, 4100));

        logger.debug('validateFileType', 'detectedType', detectedType);

        if (!detectedType) {
            return callback(new Error(`could not detect filetype: ${filePath}`));
        }

        if (!_.startsWith(detectedType.mime, targetType)) {
            return callback(new Error(`invalid filetype (${detectedType}): ${filePath}`));
        }

        if (detectedType.ext !== fileExtension) {
            let filePathValid = path.join(path.dirname(filePath), path.basename(filePath, `.${fileExtension}`));
            filePathValid = `${filePathValid}.${detectedType.ext}`;

            logger.debug('validateFileType', 'filePathValid', filePathValid);

            fs.copy(filePath, filePathValid, (error) => {
                if (error) {
                    return callback(error);
                }

                return showInfo('Added correct extension to reflect the file content',
                    `Created a copy at${os.EOL}${path.basename(filePathValid)} to reflect the files' correct media type.`,
                    (error) => {
                        if (error) {
                            return callback(error);
                        }
                        callback(null, filePathValid);
                    });
            });
        }

        callback(null, filePath);
    });
};


/**
 * Info
 * @param {String=} dialogTitle - Title
 * @param {String} targetType - audio, video
 * @param {String=} initialFolder - Initial lookup folder
 * @param {function(*)} callback - Callback
 * @return {function(*)|void}
 */
let openFile = (dialogTitle = appProductName, targetType, initialFolder = app.getPath(name), callback = () => {}) => {

    let fileTypes = {
        image: ['jpg', 'jpeg', 'bmg', 'png', 'tif'],
        audio: ['aiff', 'aif', 'm4a', 'mp3', 'mp4', 'wav']
    };


    if (!fileTypes[targetType]) {
        return callback(new Error(`target filetype ${targetType} not supported.${os.EOL}supported image filetypes: ${fileTypes.image.join()}${os.EOL}supported audio filetypes: ${fileTypes.audio.join()}`));
    }

    dialog.showOpenDialog({
        title: dialogTitle,
        properties: ['openFile', 'showHiddenFiles'],
        defaultPath: initialFolder,
        filters: [{ name: 'Sound', extensions: fileTypes[targetType] }]
    }, (filePath) => {

        if (!filePath) {
            return callback(new Error(`filepath required`));
        }

        validateFileType(filePath, targetType, (error, filePath) => {
            if (error) {
                displayDialog(`Incompatible file.${os.EOL}`, `Compatible formats are: ${fileTypes[targetType]}`,
                    ['Dismiss'], false, (error) => {

                        return callback(error);
                    });
            }

            callback(null, filePath);
        });
    });
};

/**
 * Yes/No
 * @param {String=} title - Title
 * @param {String=} message - Message
 * @param {function(*)} callback - Callback
 * @return {void}
 */
let showQuestion = (title, message, callback = () => {}) => {
    app.focus();

    return displayDialog(title, message, ['Yes', 'No'], false, callback);
};

/**
 * Error
 * @param {String=} title - Title
 * @param {String=} message - Message
 * @param {function(*)} callback - Callback
 * @return {void}
 */
let showError = (title, message, callback = () => {}) => {
    // Add Quit button
    callback = (result) => {
        if (result === 2) { return app.quit(); }
        return callback;
    };

    if (platformHelper.isMacOS) {
        app.dock.bounce('critical');
    }

    app.focus();

    return displayDialog(`Error: ${title}`, message, ['Cancel', 'OK', `Quit ${appProductName}`], true, callback);
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
