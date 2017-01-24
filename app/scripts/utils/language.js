'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const path = require('path');

  /**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));


/**
 * List Event Handlers
 * @param {HTMLElement} target - Target Element
 * @return {Array|undefined} - List Event Handlers
 * @global
 */
let getEventHandlersList = function(target) {
    if (!isDebug || !window.chrome) { return; }

    //noinspection JSUnresolvedFunction,JSHint
    return getEventListeners(target);
};

/**
 * Get Prototype chain
 * @param {*} object - Variable
 * @returns {Array} - List of prototypes names
 */
let getPrototypeList = function(object) {
    let prototypeList = [],
        parent = object;

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
 */
let getPrototype = function(object) {
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

