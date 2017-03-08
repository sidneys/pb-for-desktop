'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const fs = require('fs-extra');
const path = require('path');
const util = require('util');

/**
 * Modules
 * External
 * @constant
 */
const Appdirectory = require('appdirectory');
const chalk = require('chalk');
const _ = require('lodash');

let log = console.log;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const packageJson = require(path.join(appRootPath, 'package.json'));


/**
 * Application
 * @constant
 * @default
 */
const appName = packageJson.name;

/**
 * Filesystem
 * @constant
 * @default
 */
const appLogDirectory = (new Appdirectory(appName)).userLogs();
const appLogFile = path.join(appLogDirectory, appName + '.log');

/**
 * @default
 */
module.exports.write = false;


/**
 * @constant
 * @default
 */
const styles = {
    debug: chalk['yellow'],
    default: chalk['cyan'],
    error: chalk['red'],
    info: chalk['green'],
    warn: chalk['magenta']
}


/**
 * Log to console and file
 * @param {*} entry - Log Message
 */
let write = function(entry) {
    if (!module.exports.write) { return; }

    let date = (new Date());
    let dateString = date.toISOString().replace(/Z|T|\..+/gi, ' ').trim().split(' ').reverse().join(' ');
    let logEntry = '[' + dateString + '] ' + entry;

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
let parseLogEntry = function() {
    let messageList = Array.from(arguments);

    let namespace = _.toLower(path.basename(module.exports.namespace)).trim();
    let message;
    let title;

    for (let message in messageList) {
        if (messageList[message] !== null && typeof messageList[message] === 'object') {
            messageList[message] = '\r\n' + util.inspect(messageList[message], {
                    colors: false, depth: null, showProxy: true, showHidden: true
                });
        }
    }

    if (messageList.length > 1) {
        title = messageList[0];
        messageList.shift();
    } 

    message = messageList.join(' ');

    if (!title) {
        title = message;
    } 

    if (title === message) {
        message = '';
    } 

    return {
        namespace: namespace,
        title: title,
        message: message
    };
};

/**
 * Log
 * @param {...*} arguments - Messages or entities to print.
 */
let printCliLogMessage = function() {
    if (arguments.length === 0) { return; }

    if (process.type === 'renderer') { return printBrowserMessage.apply(this, arguments); }

    let args = Array.from(arguments);
    let style = styles.default;
    let parameters = parseLogEntry.apply(this, arguments);

    log(util.format('[%s] %s %s', style(parameters.namespace), style.bold(parameters.title), style(parameters.message)));
    write(util.format('[LOG] [%s] [%s] %s', parameters.namespace, parameters.title, parameters.message));
};


/**
 * Error
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printCliErrorMessage = function() {
    if (arguments.length === 0) { return; }

    if (process.type === 'renderer') { return printBrowserMessage.apply(this, arguments); }

    let args = Array.from(arguments);
    let style = styles.error;
    let parameters = parseLogEntry.apply(this, arguments);

    log(util.format('[%s] %s %s', style(parameters.namespace), style.bold(parameters.title), style(parameters.message)));
    write(util.format('[ERROR] [%s] [%s] %s', parameters.namespace, parameters.title, parameters.message));
};


/**
 * Browser / Chrome Devtools
 */
let printBrowserMessage = function() {
    if (arguments.length === 0) { return; }

    let self = this;
    let args = Array.from(arguments);
    let parameters = parseLogEntry.apply(this, arguments);

    // Show in console
    log.apply(self, [
        '%c [%s] %c %c%s%c %c%s',
        'background-color: rgba(74, 179, 103, 0.2); color: rgba(89, 138, 102, 0.8); padding: 0 0px; font-weight: normal',
        parameters.namespace,
        '',
        'background-color: rgba(74, 179, 103, 0.0); color: rgba(89, 138, 102, 1.0); padding: 0 0px; font-weight: bold',
        parameters.title,
        '',
        'font-weight: normal',
        parameters.message
    ]);

    write(util.format('[BROWSER] [%s] [%s] %s', parameters.namespace, parameters.title, parameters.message));
};


/**
 * Debug
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printCliDebugMessage = function() {
    if (arguments.length === 0) { return; }
    if (!isDebug) { return; }

    if (process.type === 'renderer') { return printBrowserMessage.apply(this, arguments); }

    let style = styles.debug;
    let parameters = parseLogEntry.apply(this, arguments);

    log(util.format('[%s] %s %s', style(parameters.namespace), style.bold(parameters.title), style(parameters.message)));
    write(util.format('[DEBUG] [%s] [%s] %s', parameters.namespace, parameters.title, parameters.message));
};


/**
 * Info
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printCliInfoMessage = function() {
    if (arguments.length === 0) { return; }

    if (process.type === 'renderer') { return printBrowserMessage.apply(this, arguments); }

    let args = Array.from(arguments);
    let style = styles.info;
    let parameters = parseLogEntry.apply(this, arguments);

    log(util.format('[%s] %s %s', style(parameters.namespace), style.bold(parameters.title), style(parameters.message)));
    write(util.format('[INFO] [%s] [%s] %s', parameters.namespace, parameters.title, parameters.message));
};


/**
 * Warn
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printCliWarningMessage = function() {
    if (arguments.length === 0) { return; }

    let args = Array.from(arguments);
    let style = styles.warn;
    let parameters = parseLogEntry.apply(this, arguments);

    log(util.format('[%s] %s %s', style(parameters.namespace), style.bold(parameters.title), style(parameters.message)));
    write(util.format('[WARNING] [%s] [%s] %s', parameters.namespace, parameters.title, parameters.message));
};


/**
 * @exports
 */
module.exports = (options) => {
    module.exports.namespace = module.parent.filename;
    delete require.cache[__filename];

    module.exports.write = (options && options.write) || isDebug || (process.env.LOG && Boolean(process.env.LOG) === true);

    if (module.exports.write) {
        fs.mkdirpSync(appLogDirectory);
    }

    return {
        browser: printBrowserMessage,
        debug: printCliDebugMessage,
        error: printCliErrorMessage,
        info: printCliInfoMessage,
        log: printCliLogMessage,
        warn: printCliWarningMessage
    };
};
