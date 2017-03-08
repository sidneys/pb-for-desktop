'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const minimist = require('minimist');
const _ = require('lodash');


/**
 * Check for any Debug flags
 * @return {Boolean}
 * @function
 * 
 * @public
 */
let getDebugSetting = () => {
    let argv;
    let npm_config_argv;

    try { argv = minimist(process.argv); } catch(err) {};
    try { npm_config_argv = minimist(JSON.parse(process.env.npm_config_argv).original); } catch(err) {};

    const debug = process.env.DEBUG;
    const node_env = process.env.NODE_ENV;
    const npm_lifecycle_event = process.env.npm_lifecycle_event;

    let isDebug =
        // if DEBUG=1, not if DEBUG=0
        (debug && _.isFinite(parseInt(debug)) && parseInt(debug) > 0) ||
        // if DEBUG=text
        (debug && !_.isFinite(parseInt(debug)) && Boolean(debug) === true) ||
        // if NODE_ENV=dev/debug, not if NODE_ENV=prod
        (node_env && !node_env.includes('prod') && (node_env.includes('dev') || node_env.includes('debug'))) ||
        // if package.json scriptname contains dev/debug
        (npm_lifecycle_event && (npm_lifecycle_event.includes('dev') || npm_lifecycle_event.includes('debug'))) ||
        // if --dev/--debug commandline argument
        (argv && (argv['dev'] === true || argv['debug'] === true)) ||
        // if --dev/--debug commandline argument (npm)
        (npm_config_argv && (npm_config_argv['dev'] === true || npm_config_argv['debug'] === true));

    return Boolean(isDebug);
};


/**
 * @exports
 */
module.exports = getDebugSetting();
