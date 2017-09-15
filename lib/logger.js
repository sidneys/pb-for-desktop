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
const appLogFile = path.join(appLogDirectory, `${appName}.log`);


/**
 * @constant
 * @default
 */
const typeToChalkStyle = {
    debug: 'cyan',
    log: 'cyan',
    info: 'magenta',
    warn: 'yellow',
    error: 'red'
};

/**
 * @constant
 * @default
 */
let typeToRgb = {
    debug: [100, 100, 100],
    log: [0, 128, 255],
    info: [255, 100, 150],
    warn: [200, 100, 30],
    error: [230, 70, 50]
};

/**
 * @constant
 * @default
 */
const typeEmojiMap = {
    debug: '🔧',
    log: '📝',
    info: 'ℹ️',
    warn: '⚠️',
    error: '🚨'
};

/** @namespace fs.mkdirp */
/** @namespace fs.appendFile */

/**
 * Log to console and file
 * @param {*} entry - Log Message
 */
let writeToFile = function(entry) {
    const globalOptions = module.exports.options;

    if (!globalOptions.write || isNolog) { return; }

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
 * @param {string} type - Type
 * @param {array} message - Message
 * @returns {Object}
 */
let previousTimestamp;
let parseMessage = (type, message) => {
    const globalOptions = module.exports.options;

    const namespace = globalOptions.namespace;
    const namespaceList = _.map(global[packageJson.name].namespaces, 'namespace');

    const namespacePosition = namespaceList.indexOf(namespace);
    const namespaceThread = namespacePosition & 1;

    const chalkStyle = chalk[typeToChalkStyle[type]];

    const indent = (process.type !== 'renderer') ? `i [${namespace}] `.length : `i  [${namespace}]  `.length;

    let body;
    let title;
    let timestamp;

    for (let index in message) {
        if (message.hasOwnProperty(index)) {
            if (_.isObjectLike(message[index])) {
                if (_.isArray(message[index])) {
                    message[index] = os.EOL + ' '.repeat(indent) + '[' + os.EOL + ' '.repeat(indent + 2) + message[index].join(',' + os.EOL + ' '.repeat(indent + 2)) + os.EOL + ' '.repeat(indent) + ']';
                } else {
                    message[index] = os.EOL + util.inspect(message[index], {
                        depth: null, showProxy: true, showHidden: true
                    });
                    message[index] = message[index].replace(new RegExp(os.EOL, 'gi'), `${os.EOL}${' '.repeat(indent)}`);
                }

                message[index - 1] = `${message[index - 1]}`;
            }
        }
    }

    if (message.length > 1) {
        title = message[0];
        message.shift();
    }

    body = message.join(' ');

    // if there's no title, remove body
    if (!title) { title = body; }

    // consolidate title, body
    if (title === body) { body = ''; }

    // timestamp
    if (globalOptions.timestamp) {
        if (!previousTimestamp) { previousTimestamp = present(); }
        timestamp = `${(present() - previousTimestamp).toFixed(4)} ms`;
        previousTimestamp = present();
    } else {
        timestamp = '';
    }

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
 * Print Devtools
 * @param {String} type - Logtype
 * @param {Array} message - Message
 * @returns {void}
 */
let printBrowser = function(type, message) {
    if (message.length === 0) { return; }

    const parsed = parseMessage(type, message);

    console.log(
        `${parsed.emoji} %c[%s] %c %c%s%c %c%s%c %s`,
        //%c
        `background-color: rgba(${parsed.rgb}, 0.2); color: rgba(${parsed.rgb}, 0.8); padding: 0 0px; font-weight: normal`,
        //%s
        parsed.namespace,
        //%c
        '',
        //%c
        `background-color: rgba(${parsed.rgb}, 0.0); color: rgba(${parsed.rgb}, 1.0); padding: 0 0px; font-weight: bold`,
        //%s
        parsed.title,
        //%c
        '',
        //%c
        `background-color: rgba(${parsed.rgb}, 0.1); color: rgba(${parsed.rgb}, 1.0); padding: 0 0px; font-weight: normal`,
        //%s
        parsed.body,
        //%c
        `background-color: rgba(${parsed.rgb}, 0.0); color: rgba(${parsed.rgb}, 0.5); padding: 0 0px; font-weight: normal`,
        //%s
        parsed.timestamp
    );

    writeToFile(util.format(
        `[renderer] [${parsed.type}] [%s] %s %s`,
        parsed.namespace, parsed.title, parsed.body
    ));
};

/**
 * Print Terminal
 * @param {String} type - Logtype
 * @param {Array} message - Message
 * @returns {void}
 */
let printCli = function(type, message) {
    if (message.length === 0) { return; }

    const parsed = parseMessage(type, message);

    console.log(util.format(
        `${parsed.emoji} [%s] %s %s %s`,
        //[%s]
        parsed.thread ? parsed.chalk(parsed.namespace) : parsed.chalk.underline(parsed.namespace),
        //%s
        parsed.chalk.bold(parsed.title),
        //%s
        parsed.chalk(parsed.body),
        //%s
        parsed.timestamp
    ));

    writeToFile(util.format(
        `[main] [${parsed.type}] [%s] %s %s`,
        parsed.namespace, parsed.title, parsed.body
    ));
};

/**
 * Print
 * @returns {Function}
 */
let print = (process.type === 'renderer') ? printBrowser.bind(console) : printCli;


/**
 * @exports
 * @param {Object} options - Logger options
 * @returns {Object}
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
        debug() { if (isDebug) { print('debug', Array.from(arguments))} },
        log() { print('log', Array.from(arguments)) },
        info() { print('log', Array.from(arguments)) },
        warn() { print('warn', Array.from(arguments)) },
        error() { print('error', Array.from(arguments)) }
    };
};

