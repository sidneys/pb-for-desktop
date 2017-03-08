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
const typeChalkMap = {
    debug: chalk['yellow'],
    error: chalk['red'],
    info: chalk['green'],
    log: chalk['cyan'],
    warning: chalk['magenta']
};

/**
 * @constant
 * @default
 */
const typeRgbMap = {
    debug: '200, 100, 0',
    error: '200, 0, 0',
    info: '100, 200, 0',
    log: '0, 128, 255',
    warning: '200, 0, 200'
};

/**
 * @constant
 * @default
 */
const typeEmojiMap = {
    debug: '🔧',
    error: '🚨',
    info: 'ℹ️',
    log: '📝',
    warning: '⚠️'
};


/**
 * Log to console and file
 * @param {*} entry - Log Message
 */
let writeToFile = function(entry) {
    if (!module.exports.write) { return; }

    const date = (new Date());
    const dateString = date.toISOString().replace(/Z|T|\..+/gi, ' ').trim().split(' ').reverse().join(' ');
    const logEntry = '[' + dateString + '] ' + entry;

    // Create Directory
    fs.mkdirp(path.dirname(appLogFile), (err) => {
        if (err) {
            return console.error('writeToFile', 'fs.mkdirp', err);
        }
        // Append Log
        fs.appendFile(appLogFile, (logEntry + '\r\n'), function(err) {
            if (err) {
                return console.error('writeToFile', 'fs.appendFile', err);
            }
        });
    });
};

let getTypeEmoji = () => {
    
}

/**
 * Format log messages
 * @returns {Object}
 */
let parseLogEntry = function() {
    let messageList = Array.from(arguments);

    const type = messageList[0];
    messageList.shift();

    const namespace = path.basename(module.exports.namespace).trim();
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
        chalk: typeChalkMap[type],
        emoji: typeEmojiMap[type],
        message: message,
        namespace: _.toLower(namespace),
        rgb: typeRgbMap[type],
        title: title,
        type: _.toUpper(type),
    };
};


/**
 * Browser / Chrome Devtools
 */
let printBrowserMessage = function() {
    if (arguments.length === 0) { return; }

    const parameters = parseLogEntry.apply(this, arguments);

    // Show in console
    log.apply(this, [
        `${parameters.emoji} %c [%s] %c %c%s%c %c%s`,
        `background-color: rgba(${parameters.rgb}, 0.1); color: rgba(${parameters.rgb}, 0.8); padding: 0 0px; font-weight: normal`,
        parameters.namespace,
        '',
        `background-color: rgba(${parameters.rgb}, 0.0); color: rgba(${parameters.rgb}, 1.0); padding: 0 0px; font-weight: bold`,
        parameters.title,
        '',
        'font-weight: normal',
        parameters.message
    ]);

    writeToFile(util.format(`[PROCESS:RENDERER] [${parameters.type}] [%s] [%s] %s`, parameters.namespace, parameters.title, parameters.message));
};

/**
 * Warn
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printMessage = function() {
    if (arguments.length === 0) { return; }

    if (process.type === 'renderer') { return printBrowserMessage.apply(this, arguments); }

    const parameters = parseLogEntry.apply(this, arguments);

    log(util.format(`${parameters.emoji} [%s] %s %s`, parameters.chalk(parameters.namespace), parameters.chalk.bold(parameters.title), parameters.chalk(parameters.message)));

    writeToFile(util.format(`[PROCESS:MAIN] [${parameters.type}] [%s] [%s] %s`, parameters.namespace, parameters.title, parameters.message));
};


/**
 * Debug
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printDebug = function() {
    const type = 'debug';

    let args = Array.from(arguments);
    args.unshift(type);
    return printMessage.apply(this, args);
};

/**
 * Error
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printError = function() {
    const type = 'error';

    let args = Array.from(arguments);
    args.unshift(type);
    return printMessage.apply(this, args);
};

/**
 * Info
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printInfo = function() {
    const type = 'info';

    let args = Array.from(arguments);
    args.unshift(type);
    return printMessage.apply(this, args);
};

/**
 * Log
 * @param {...*} arguments - Messages or entities to print.
 */
let printLog = function() {
    const type = 'log';

    let args = Array.from(arguments);
    args.unshift(type);
    return printMessage.apply(this, args);
};

/**
 * Warn
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printWarning = function() {
    const type = 'warning';

    let args = Array.from(arguments);
    args.unshift(type);
    return printMessage.apply(this, args);
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
        debug: printDebug,
        error: printError,
        info: printInfo,
        log: printLog,
        warn: printWarning
    };
};
