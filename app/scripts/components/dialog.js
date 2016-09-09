'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const os = require('os');
const path = require('path');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const { app, dialog, ipcMain, remote } = require('electron');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;

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
 */
let appProductName = packageJson.productName || packageJson.name;

/**
 * @global
 */
let defaultDialogDelay = 1000;


/**
 * Display Message Box
 * @param {String} title - Title
 * @param {String} message - Message
 * @param {Array=} buttons - Buttons
 * @param {Function=} callback - Callback
 */
let displayMessage = function(title, message, buttons, callback) {
    let self = this;

    let messageTimeout = setTimeout(function() {
        dialog.showMessageBox({
            type: 'warning',
            buttons: buttons || ['OK'],
            defaultId: 0,
            title: title,
            message: title,
            detail: os.EOL + message + os.EOL
        }, callback || function() {});
        clearTimeout(messageTimeout);
    }, defaultDialogDelay, self);
};

/**
 * Display Error
 * @param {String} message - Error Message
 * @param {Boolean=} allowQuit - Show Retry / Quit
 */
let displayError = function(message, allowQuit) {
    let callback = function() {};

    if (platformHelper.isMacOS) {
        app.dock.bounce('critical');
    }

    if (allowQuit) {
        callback = function(result) {
            if (result === 0) { remote.mainWindow.getFocusedWindow().reload(); } // Retry
            if (result === 1) { app.quit(); } // Quit
        };
    }

    return displayMessage('Error', message, ['Retry', 'Quit ' + appProductName], callback());
};

/**
 * Display Critical Error
 * @param {String=} errorDescription - Chromium Error Description
 * @param {String} message - Error Message
 */
let displayInternalError = function(errorDescription, message) {
    message = message ? os.EOL + message.trim() : '';
    displayError(getErrorText(errorDescription) + message);
};

/**
 * Get Error Text
 * @param {String=} errorDescription - Chromium Error Description
 * @returns {String} Readable Error Message
 */
let getErrorText = function(errorDescription) {
    const textDefault = 'An Error has occurred.',
        textMap = {
            ERR_ADDRESS_UNREACHABLE: 'Network address unreachable.',
            ERR_CONNECTION_CLOSED: 'Network connection closed.',
            ERR_CONNECTION_REFUSED: 'Network connection refused.',
            ERR_CONNECTION_RESET: 'Network connection was reset.',
            ERR_CONNECTION_TIMED_OUT: 'Network connection timed out.',
            ERR_INTERNET_DISCONNECTED: 'Internet connection disconnected.',
            ERR_NAME_NOT_RESOLVED: 'Network address could not be resolved.',
            ERR_NETWORK_CHANGED: 'Network was changed.',
            ERR_QUIC_PROTOCOL_ERROR: 'QUIC network protocol error.',
            ERR_TIMED_OUT: 'Network request timed out.'
        };

    return textMap[errorDescription] || textDefault;
};


/**
 * @exports
 */
module.exports = {
    displayError: displayError,
    displayInternalError: displayInternalError,
    displayMessage: displayMessage
};
