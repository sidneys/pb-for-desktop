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
const appRootPath = require('app-root-path')['path'];

/**
 * Modules
 * Internal
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-env'))('debug');


/**
 * List Event Handlers
 * @param {HTMLElement} target - Target Element
 * @return {Array|undefined} - List Event Handlers
 * @function
 *
 * @public
 */
let getEventHandlersList = (target) => {
    if (!isDebug || !window.chrome) { return; }

    //noinspection JSUnresolvedFunction,JSHint
    return getEventListeners(target);
};

/**
 * Get Prototype chain
 * @param {*} object - Variable
 * @returns {Array} - List of prototypes names
 * @function
 *
 * @public
 */
let getPrototypeList = (object) => {
    let prototypeList = [];
    let parent = object;

    while (true) {
        parent = Object.getPrototypeOf(parent);
        if (parent === null) {
            break;
        }
        prototypeList.push(Object.prototype.toString.call(parent).match(/^\[object\s(.*)]$/)[1]);
    }
    return prototypeList;
};

/**
 * Get root Prototype
 * @param {*} object - Variable
 * @returns {String} - Type
 * @function
 *
 * @public
 */
let getPrototype = (object) => {
    return getPrototypeList(object)[0];
};


/**
 * @exports
 */
module.exports = {
    getEventHandlers: getEventHandlersList,
    getPrototype: getPrototype,
    getPrototypes: getPrototypeList
};

