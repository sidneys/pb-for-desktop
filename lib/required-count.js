'use strict';


/**
 * Modules
 * Internal
 */
let count;

let isFirst = () => {
    return Boolean(count);
};

let getCount = () => {
    let moduleCache = require.cache[__filename];
    if (moduleCache.hasOwnProperty('requireCount')) {
        moduleCache['requireCount'] = moduleCache['requireCount'] + 1;
    }
    else {
        moduleCache['requireCount'] = 0;
    }

    return count = moduleCache['requireCount'];
};


/**
 * @exports
 */
module.exports = {
    isFirst: isFirst,
    getCount: getCount
};

