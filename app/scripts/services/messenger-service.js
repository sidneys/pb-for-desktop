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
const { app, dialog } = require('electron');

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
    showQuestion: showQuestion
};
