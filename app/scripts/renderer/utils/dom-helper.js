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
const fileUrl = require('file-url');

/**
 * Modules
 * Internal
 * @constant
 */
const language = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'utils', 'language'));


/**
 * Add platform name as class to elements
 * @param {String=} element - Element (Default: <html>)
 * @function
 *
 * @public
 */
let addPlatformClass = (element) => {
    let elementName = element || 'html';
    let elementTarget = document.querySelector(elementName);

    // Add nodejs platform name
    elementTarget.classList.add(process.platform);

    // Add readable platform name
    switch (process.platform) {
        case 'darwin':
            elementTarget.classList.add('macos');
            elementTarget.classList.add('osx');
            break;
        case 'win32':
            elementTarget.classList.add('windows');
            elementTarget.classList.add('win');
            break;
        case 'linux':
            elementTarget.classList.add('unix');
            break;
    }
};

/**
 * Check if Object is an HTML Element
 * @param {*} object - Object
 * @returns {Boolean} - Type
 * @function
 *
 * @public
 */
let isHtmlElement = (object) => {
    return language.getPrototypes(object).indexOf('HTMLElement') === 1;
};

/**
 * Load external scripts
 * @param {String} filePath - Path to JavaScript
 * @function
 *
 * @public
 */
let loadScript = (filePath) => {
    let url = fileUrl(filePath);

    let script = document.createElement('script');
    script.src = url;
    script.type = 'text/javascript';

    script.onload = () => {
        console.debug('dom-helper', 'loadScript', 'complete', url);
    };

    document.getElementsByTagName('head')[0].appendChild(script);
};

/**
 * Load external stylesheets
 * @param {String} filePath - Path to CSS
 * @function
 *
 * @public
 */
let loadStylesheet = (filePath) => {
    let url = fileUrl(filePath);

    let link = document.createElement('link');
    link.href = url;
    link.type = 'text/css';
    link.rel = 'stylesheet';

    link.onload = () => {
        console.debug('dom-helper', 'loadStylesheet', 'complete', url);
    };

    document.getElementsByTagName('head')[0].appendChild(link);
};

/**
 * Set Text Message
 * @param {HTMLElement} element - Element
 * @param {String=} text - Message
 * @function
 *
 * @public
 */
let setText = (element, text) => {
    if (!isHtmlElement(element)) { return; }

    element.innerText = text || '';
};

/**
 * @param {HTMLElement} element - Element
 * @param {Boolean} visible - Show or hide
 * @param {Number=} delay - Delay
 * @function
 *
 * @public
 */
let setVisibility = (element, visible, delay) => {
    if (!isHtmlElement(element)) { return; }

    let timeout = setTimeout(() => {
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
 * @exports
 */
module.exports = {
    addPlatformClass: addPlatformClass,
    isHtmlElement: isHtmlElement,
    loadScript: loadScript,
    loadStylesheet: loadStylesheet,
    setText: setText,
    setVisibility: setVisibility
};
