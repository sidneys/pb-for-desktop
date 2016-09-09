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
const language = require(path.join(appRootPath, 'app', 'scripts', 'utils', 'language'));


/**
 * Add platform name as class to elements
 * @param {String=} element - Element (Default: <html>)
 */
let addPlatformClass = function(element) {
    let platformName = process.platform,
        elementName = element || 'html',
        elementTarget = document.querySelector(elementName);

    elementTarget.classList.add(platformName);
};

/**
 * Check if Object is an HTML Element
 * @param {*} object - Object
 * @returns {Boolean} - Type
 */
let isHtmlElement = function(object) {
    return language.getPrototypes(object).indexOf('HTMLElement') === 1;
};

/**
 * @param {HTMLElement} element - Element
 * @param {Boolean} visible - Show or hide
 * @param {Number=} delay - Delay
 */
let setVisibility = function(element, visible, delay) {
    if (!isHtmlElement(element)) { return; }

    let timeout = setTimeout(function() {
        if (visible) {
            element.classList.add('show');
            element.classList.remove('hide');
        } else {
            element.classList.add('hide');
            element.classList.remove('show');
        }
        clearTimeout(timeout);
    }, (delay || 0));
};

/**
 * Set Text Message
 * @param {HTMLElement} element - Element
 * @param {String=} text - Message
 */
let setText = function(element, text) {
    if (!isHtmlElement(element)) { return; }
    element.innerText = text || '';
};


/**
 * @exports
 */
module.exports = {
    addPlatformClass: addPlatformClass,
    isHtmlElement: isHtmlElement,
    setText: setText,
    setVisibility: setVisibility
};
