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
const appRootPath = require('app-root-path')['path'];

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


module.exports = {
    isFirst: isFirst,
    getCount: getCount
};

