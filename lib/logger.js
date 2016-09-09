'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const fs = require('fs-extra');
const path = require('path');
const util = require('util');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const _ = require('lodash');
const chalk = require('chalk');
const Appdirectory = require('appdirectory');

let log = console.log;

/**
 * Modules
 * External
 * @global
 * @const
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @global
 * @const
 */
const packageJson = require(path.join(appRootPath, 'package.json'));
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));

/**
 * App
 * @global
 */
let appName = packageJson.name;

/**
 * @global
 */
let appLogDirectory = (new Appdirectory(appName)).userLogs();
let appLogFile = path.join(appLogDirectory, appName + '.log');

/**
 * Styles
 */
let writeToFile = false;
let styleDefault = chalk['cyan'];
let styleError = chalk['red'];
let styleDebug = chalk['yellow'];


/**
 * Log to console and file
 * @param {*} entry - Log Message
 */
let write = function(entry) {
    if (!writeToFile) {
        return;
    }

    let date = (new Date()),
        dateString = date.toISOString().replace(/Z|T|\..+/gi, ' ').trim().split(' ').reverse().join(' '),
        logString = entry,
        logEntry = '[' + dateString + '] ' + logString;

    // Create Directory
    fs.mkdirp(path.dirname(appLogFile), (err) => {
        if (err) {
            return console.error('log', 'fs.mkdirp', err);
        }
        // Append Log
        fs.appendFile(appLogFile, (logEntry + '\r\n'), function(err) {
            if (err) {
                return console.error('log', 'fs.appendFile', err);
            }
        });
    });
};

/**
 * Format log messages
 * @param {Array} messageList - Messages or entities to print.
 * @returns {Object}
 */
let parseLogEntry = function(messageList) {
    let prefix = _.toUpper(path.basename(module.parent.filename)),
        label = messageList.shift(),
        messageString;

    for (let message in messageList) {
        if (messageList[message] !== null && typeof messageList[message] === 'object') {
            messageList[message] = '\r\n' + util.inspect(messageList[message], {
                    colors: false, depth: null, showProxy: true, showHidden: true
                });
        }
    }

    messageString = messageList.join(' ');

    return {
        prefix: prefix,
        label: label,
        message: messageString
    };
};

/**
 * Log Message
 * @param {...*} arguments - Messages or entities to print.
 */
let printCliMessage = function() {
    if (arguments.length === 0) { return; }

    let args = Array.from(arguments);

    let style = styleDefault,
        parameters = parseLogEntry(args);

    log(util.format('[%s] [%s] %s', style.bold.inverse(parameters.prefix), style.bold(parameters.label), style(parameters.message)));
    write(util.format('[%s] [%s] %s', parameters.prefix, parameters.label, parameters.message));
};


/**
 * Log Error Message
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printCliErrorMessage = function() {
    if (arguments.length === 0) { return; }

    let args = Array.from(arguments);

    let style = styleError,
        parameters = parseLogEntry(args);

    log(util.format('[%s] [%s] %s', style.bold.inverse(parameters.prefix), style.bold(parameters.label), style(parameters.message)));
    write(util.format('[%s] [ERROR] [%s] %s', parameters.prefix, parameters.label, parameters.message));
};

/**
 * Log Debug Message
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printCliDebugMessage = function() {
    if (arguments.length === 0) { return; }

    if (!isDebug) { return; }

    let args = Array.from(arguments);

    let style = styleDebug,
        parameters = parseLogEntry(args);

    log(util.format('[%s] [%s] %s', style.bold.inverse(parameters.prefix), style.bold(parameters.label), style(parameters.message)));
    write(util.format('[DEBUG] [%s] [%s] %s', parameters.prefix, parameters.label, parameters.message));
};


/**
 * Logger
 */
let printDevtoolsMessage = function() {
    if (arguments.length === 0) { return; }

    if (!isDebug) { return; }

    let self = this,
        args = Array.from(arguments),
        parameters = parseLogEntry(args);

    // Show in console
    log.apply(self, [
        '%c%s%c %c%s%c %c%s',
        'background-color: rgba(74, 179, 103, 1.0); color: rgba(255, 255, 255, 1.0); padding: 0 2px; font-weight: bold',
        parameters.prefix,
        '',
        'background-color: rgba(74, 179, 103, 0.2); color: rgba(74, 179, 103, 1.0); padding: 0 2px',
        parameters.label,
        '',
        'font-weight: bold',
        parameters.message
    ]);

    write(util.format('[%s] [%s] %s', parameters.prefix, parameters.label, parameters.message));
};


/**
 * @exports
 */
module.exports = (options) => {

    writeToFile = options && options.writeToFile;

    if (writeToFile) {
        fs.mkdirpSync(appLogDirectory);
    }

    return {
        log: printCliMessage,
        error: printCliErrorMessage,
        debug: printCliDebugMessage,
        devtools: printDevtoolsMessage
    };
};
