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
const _ = require('lodash');


/**
 * Check for any Debug flags
 * @return {Boolean}
 * @function
 * 
 * @public
 */
let getDebugSetting = () => {
    const debug = process.env.DEBUG;
    const node_env = process.env.NODE_ENV;
    const nle = process.env.npm_lifecycle_event;

    let isDebug =
        // include DEBUG=1, exclude DEBUG=0
        debug && _.isFinite(parseInt(debug)) && parseInt(debug) > 0 ||
        // include DEBUG=text, exclude DEBUG=''
        debug && !_.isFinite(parseInt(debug)) && Boolean(debug) === true ||
        // include NODE_ENV=dev/debug, exclude NODE_ENV=prod
        node_env && !node_env.includes('prod') && (node_env.includes('dev') || node_env.includes('debug')) ||
        // include if package.json scriptname contains dev/debug
        nle && (nle.includes('dev') || nle.includes('debug'));

    return Boolean(isDebug);
};


/**
 * @exports
 */
module.exports = getDebugSetting();
