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
const { app, BrowserWindow, dialog } = electron || electron.remote;

/**
 * Modules
 * External
 * @constant
 */
const logger = require('@sidneys/logger')({ write: true });
const platformTools = require('@sidneys/platform-tools');


/**
 * Application
 * @constant
 * @default
 */
const appProductName = global.manifest.productName;


/**
 * Wrapper for dialog.showMessageBox
 * @param {String} title - Title
 * @param {String} message - Message
 * @param {Array} buttonList - Buttons
 * @param {String} type - Type
 * @param {function(*)} callback - Callback
 *
 * @private
 */
let showMessage = (title = appProductName, message = title, buttonList = ['OK'], type = 'info', callback = () => {}) => {
    logger.debug('showMessage');

    logger.debug('showMessage', 'title', title, 'message', message, 'buttonList', buttonList, 'type', type);

    dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: type,
        title: title,
        message: title,
        detail: message,
        buttons: buttonList,
        defaultId: 0
    }, (response) => {
        logger.debug('showMessage', `title: '${title}' message: '${message}' response: '${response} (${buttonList[response]})'`);
        callback(response);
    });
};


/** @namespace detectedType.ext */
/** @namespace detectedType.mime */
/** @namespace fs.copy */
/** @namespace fs.exists */
/** @namespace fs.stat */

/**
 * Validate file exists
 * @param {String|String[]} filePath - Path
 * @param {function(*)} callback - Callback
 *
 * @private
 */
let validateFile = (filePath, callback = () => {}) => {
    logger.debug('validateFile');

    filePath = path.normalize(filePath.toString());

    fs.stat(filePath, (error) => {
        if (error) {
            callback(error);
            return;
        }

        callback(null, filePath);
    });
};


/**
 * File Dialog
 * @param {String=} dialogTitle - Title
 * @param {Array=} extensionList - Accepted file extensions
 * @param {String=} initialFolder - Initial lookup folder
 * @param {function(*)} callback - Callback
 *
 * @private
 */
let file = (dialogTitle = appProductName, extensionList = ['*'], initialFolder = app.getPath(name), callback = () => {}) => {
    logger.debug('file');

    dialog.showOpenDialog({
        title: dialogTitle,
        properties: ['openFile', 'showHiddenFiles', 'treatPackageAsDirectory'],
        defaultPath: initialFolder,
        filters: [{ name: 'Filter', extensions: extensionList }]
    }, (filePath) => {

        if (!filePath) {
            return callback(new Error(`filepath required`));
        }

        validateFile(filePath, (error, filePathVerified) => {
            if (error) {
                showMessage(`File not found.${os.EOL}`, ['Dismiss'], 'warning', (error) => {
                    callback(error);
                });
                return;
            }

            callback(null, filePathVerified);
        });
    });
};


/**
 * Error Dialog
 * @param {String=} message - Message
 * @param {function(*)} callback - Callback
 *
 * @public
 */
let error = (message, callback = () => {}) => {
    logger.debug('error');

    if (platformTools.isMacOS) {
        app.dock.bounce('critical');
    }

    app.focus();

    showMessage('Error', message, ['Dismiss', 'Quit', 'Reload'], 'error', (response, checkboxChecked) => {
        if (response === 1) {
            app.quit();
            return;
        } else if (response === 2) {
            BrowserWindow.getFocusedWindow().reload();
            return;
        }

        callback(response, checkboxChecked);
    });
};

/**
 * Info Dialog
 * @param {String=} title - Title
 * @param {String=} message - Message
 * @param {function(*)} callback - Callback
 *
 * @public
 */
let info = (title, message, callback = () => {}) => {
    logger.debug('info');

    showMessage(title, message, ['Dismiss'], 'info', callback);
};

/**
 * Question Show
 * @param {String=} title - Title
 * @param {String=} message - Message
 * @param {function(*)} callback - Callback
 *
 * @public
 */
let question = (title, message, callback = () => {}) => {
    logger.debug('question');

    app.focus();

    showMessage(title, message, ['Yes', 'No'], 'question', callback);
};


/**
 * @exports
 */
module.exports = {
    error: error,
    file: file,
    info: info,
    question: question
};
