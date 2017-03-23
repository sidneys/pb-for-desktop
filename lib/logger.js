'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const util = require('util');

/**
 * Modules
 * External
 * @constant
 */
const Appdirectory = require('appdirectory');
const chalk = require('chalk');
const present = require('present');
const _ = require('lodash');

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];

/**
 * Modules
 * Internal
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-env'))('debug');
const isNolog = require(path.join(appRootPath, 'lib', 'is-env'))('nolog');
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
 * @constant
 * @default
 */
const typeToChalkStyle = {
    debug: 'cyan',
    error: 'red',
    information: 'magenta',
    log: 'cyan',
    warning: 'yellow'
};

/**
 * @constant
 * @default
 */
let typeToRgb = {
    debug: [100, 100, 100],
    error: [230, 70, 50],
    information: [255, 100, 150],
    log: [0, 128, 255],
    warning: [200, 100, 30]
};

/**
 * @constant
 * @default
 */
const typeEmojiMap = {
    debug: '🔧',
    error: '🚨',
    information: 'ℹ️',
    log: '📝',
    warning: '⚠️'
};


/**
 * Log to console and file
 * @param {*} entry - Log Message
 */
let writeToFile = function(entry) {
    if (!module.exports.options.write || isNolog) {
        return;
    }

    const date = (new Date());
    const dateString = date.toISOString().replace(/Z|T|\..+/gi, ' ').trim().split(' ').reverse().join(' ');
    const logEntry = '[' + dateString + '] ' + entry;

    // Create Directory
    fs.mkdirp(path.dirname(appLogFile), (err) => {
        if (err) {
            console.error('logger', 'writeToFile', 'fs.mkdirp', err);
            return;
        }
        // Append Log
        fs.appendFile(appLogFile, (`${logEntry}${os.EOL}`), (err) => {
            if (err) {
                console.error('logger', 'writeToFile', 'fs.appendFile', err);
            }
        });
    });
};

/**
 * Format log messages
 * @returns {Object}
 */
let getParsedMessage = function() {
    const namespace = module.exports.options.namespace;
    const namespaceList = _.map(global[packageJson.name].namespaces, 'namespace');
    const namespacePosition = namespaceList.indexOf(namespace);
    const namespaceThread = namespacePosition & 1;

    const timestamp = module.exports.options.timestamp;

    let messageList = Array.from(arguments);
    const type = messageList[0];
    messageList.shift();

    const chalkStyle = chalk[typeToChalkStyle[type]];
    const indent = (process.type !== 'renderer') ? `i [${namespace}] `.length : `i  [${namespace}]  `.length;

    let body;
    let title;

    for (let index in messageList) {
        if (_.isObjectLike(messageList[index])) {
            if (_.isArray(messageList[index])) {
                messageList[index] = os.EOL + ' '.repeat(indent) + '[' + os.EOL + ' '.repeat(indent + 2) + messageList[index].join(',' + os.EOL + ' '.repeat(indent + 2)) + os.EOL + ' '.repeat(indent) + ']';
            } else {
                messageList[index] = os.EOL + util.inspect(messageList[index], {
                        depth: null, showProxy: true, showHidden: true
                    });
                messageList[index] = messageList[index].replace(new RegExp(os.EOL, 'gi'), `${os.EOL}${' '.repeat(indent)}`);
            }

            messageList[index - 1] = `${messageList[index - 1]}`;
        }
    }

    if (messageList.length > 1) {
        title = messageList[0];
        messageList.shift();
    }

    body = messageList.join(' ');

    // if there's no title, remove body
    if (!title) { title = body; }

    // consolidate title, body
    if (title === body) { body = ''; }

    return {
        chalk: chalkStyle,
        emoji: typeEmojiMap[type],
        body: body,
        namespace: namespace,
        rgb: typeToRgb[type].join(),
        timestamp: timestamp,
        title: title,
        type: _.toUpper(type),
        thread: namespaceThread
    };
};


/**
 * Print to BROWSER
 */
let printBrowserMessage = function() {
    if (arguments.length === 0) { return; }

    const parameters = getParsedMessage.apply(this, arguments);

    if (!this.previousLog) {
        this.previousLog = present();
    }

    console.log.apply(this, [
        `${parameters.emoji} %c[%s] %c %c%s%c %c%s%c %s`,
        //%c
        `background-color: rgba(${parameters.rgb}, 0.2); color: rgba(${parameters.rgb}, 0.8); padding: 0 0px; font-weight: normal`,
        //%s
        parameters.namespace,
        //%c
        '',
        //%c
        `background-color: rgba(${parameters.rgb}, 0.0); color: rgba(${parameters.rgb}, 1.0); padding: 0 0px; font-weight: bold`,
        //%s
        parameters.title,
        //%c
        '',
        //%c
        `background-color: rgba(${parameters.rgb}, 0.1); color: rgba(${parameters.rgb}, 1.0); padding: 0 0px; font-weight: normal`,
        //%s
        parameters.body,
        //%c
        `background-color: rgba(${parameters.rgb}, 0.0); color: rgba(${parameters.rgb}, 0.5); padding: 0 0px; font-weight: normal`,
        //%s
        parameters.timestamp ? ((present() - this.previousLog).toFixed(4) + ' ms') : ''
    ]);

    writeToFile(util.format(
        `[renderer] [${parameters.type}] [%s] %s %s`,
        parameters.namespace, parameters.title, parameters.body
    ));

    this.previousLog = present();
};

/**
 * Print TERMINAL
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printTerminalMessage = function() {
    if (arguments.length === 0) { return; }

    const parameters = getParsedMessage.apply(this, arguments);

    if (process.type === 'renderer') { return printBrowserMessage.apply(this, arguments); }

    if (!this.previousLog) {
        this.previousLog = present();
    }


    console.log(util.format(
        `${parameters.emoji} [%s] %s %s %s`,
        //[%s]
        parameters.thread ? parameters.chalk(parameters.namespace) : parameters.chalk.underline(parameters.namespace),
        //%s
        parameters.chalk.bold(parameters.title),
        //%s
        parameters.chalk(parameters.body),
        //%s
        parameters.timestamp ? (parameters.chalk.italic((present() - this.previousLog).toFixed(4) + ' ms')) : ''
    ));

    writeToFile(util.format(
        `[main] [${parameters.type}] [%s] %s %s`,
        parameters.namespace, parameters.title, parameters.body
    ));

    this.previousLog = present();
};


/**
 * Debug
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printDebug = function() {
    const type = 'debug';

    if (!isDebug) { return; }

    let args = Array.from(arguments);
    args.unshift(type);
    return printTerminalMessage.apply(this, args);
};

/**
 * Error
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printError = function() {
    const type = 'error';

    let args = Array.from(arguments);
    args.unshift(type);
    return printTerminalMessage.apply(this, args);
};

/**
 * Info
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printInfo = function() {
    const type = 'information';

    let args = Array.from(arguments);
    args.unshift(type);
    return printTerminalMessage.apply(this, args);
};

/**
 * Log
 * @param {...*} arguments - Messages or entities to print.
 */
let printLog = function() {
    const type = 'log';

    let args = Array.from(arguments);
    args.unshift(type);
    return printTerminalMessage.apply(this, args);
};

/**
 * Warn
 * @param {...*} arguments - Error Messages or entities to print.
 */
let printWarning = function() {
    const type = 'warning';

    let args = Array.from(arguments);
    args.unshift(type);
    return printTerminalMessage.apply(this, args);
};


/**
 * @exports
 */
module.exports = (options) => {

    const file = (module.parent && module.parent.filename) || module.filename;
    const namespace = path.basename(file) || packageJson.name;

    // Instance Options
    let defaultOptions = {
        namespace: namespace,
        timestamp: true,
        write: false
    };

    options = _.defaultsDeep(options, defaultOptions);
    module.exports.options = options;

    // Global Configuration
    global[packageJson.name] = {
        namespaces: []
    };

    global[packageJson.name].namespaces.push(options);

    // Remove filename from cache, enables detection of requiring module names
    delete require.cache[__filename];

    return {
        browser: printBrowserMessage,
        debug: printDebug,
        error: printError,
        info: printInfo,
        information: printInfo,
        log: printLog,
        warn: printWarning,
        warning: printWarning
    };
};
