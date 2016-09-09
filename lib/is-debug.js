'use strict';


/**
 * Check for Debug flags
 * @return {Boolean}
 */
let getDebugFlag = () => {
    let isDebug =
        process.env.DEBUG && (process.env.DEBUG > 0) ||
        process.env.NODE_ENV && (process.env.NODE_ENV.includes('dev') || process.env.NODE_ENV.includes('debug')) ||
        process.env.npm_lifecycle_event && (process.env.npm_lifecycle_event.includes('dev') || process.env.npm_lifecycle_event.includes('debug'));

    return Boolean(isDebug);
};


/**
 * @exports
 */
module.exports = getDebugFlag();
