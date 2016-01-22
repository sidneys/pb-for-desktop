'use strict';


/**
 * Modules
 * Node
 */
const path = require('path'),
    util = require('util'),
    os = require('os');


/**
 * Modules
 * External
 */
const _ = require('lodash'),
    chalk = require('chalk');


/**
 * Styles
 */
let styleDefault = chalk.cyan,
    styleError = chalk.red,
    styleDebug = chalk.yellow;


/**
 * Format log messages
 * @param {Array} messageList - Messages or entities to print.
 * @returns {Object}
 */
let format = function(messageList) {
    let prefix = _.toUpper(path.basename(module.parent.filename)),
        label = messageList.shift(),
        messageString;

    for (let message in messageList) {
        if (messageList[message] !== null && typeof messageList[message] === 'object') {
            messageList[message] = '\r\n' + util.inspect(messageList[message], {
                    colors: true, showProxy: true, showHidden: true, depth: null
                });
        }
    }

    messageString = messageList.join(' ');

    // DEBUG
    // console.log('messageString', messageString );

    return {
        prefix: prefix,
        label: label,
        message: messageString
    };
};

/**
 * Message
 * @param {...*} arguments - Messages or entities to print.
 */
let log = function() {
    if (arguments.length === 0) { return; }

    let args = Array.from(arguments);

    let style = styleDefault,
        parameters = format(args);

    console.log(util.format('[%s] [%s] %s', style.bold.inverse(parameters.prefix), style.bold(parameters.label), style(parameters.message)));
};


/**
 * Error Message
 * @param {...*} arguments - Error Messages or entities to print.
 */
let error = function() {
    if (arguments.length === 0) { return; }

    let args = Array.from(arguments);


    let style = styleError,
        parameters = format(args);

    console.log(util.format('[%s] [%s] %s', style.bold.inverse(parameters.prefix), style.bold(parameters.label), style(parameters.message)));
};


/**
 * Debug Message
 * @param {...*} arguments - Error Messages or entities to print.
 */
let debug = function() {
    if (arguments.length === 0) { return; }

    // Debug environment only
    if (!process.env['DEBUG']) { return; }

    let args = Array.from(arguments);

    let style = styleDebug,
        parameters = format(args);

    console.log(util.format('[%s] [%s] %s', style.bold.inverse(parameters.prefix), style.bold(parameters.label), style(parameters.message)));
};


/**
 * exports
 */
module.exports = {
    log: log,
    error: error,
    debug: debug
};
