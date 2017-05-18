'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const fs = require('fs');
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
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const language = require(path.join(appRootPath, 'lib', 'language'));


/**
 * Add platform name as class to elements
 * @param {String=} element - Element (Default: <html>)
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
 */
let isHtmlElement = (object) => {
    return language.getPrototypes(object).indexOf('HTMLElement') === 1;
};

/**
 * Load external scripts
 * @param {String} filePath - Path to JavaScript
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
 * Set element text content
 * @param {HTMLElement} element - Element
 * @param {String} text - Text
 * @param {Number=} delay - Delay
 */
let setText = (element, text = '', delay = 0) => {
    let timeout = setTimeout(() => {
        element.innerText = text;
        clearTimeout(timeout);
    }, delay);
};

/**
 * Set element visibility
 * @param {HTMLElement} element - Element
 * @param {Boolean} visible - Show or hide
 * @param {Number=} delay - Delay
 */
let setVisibility = (element, visible, delay = 0) => {
    let timeout = setTimeout(() => {
        if (visible) {
            element.classList.add('show');
            element.classList.remove('hide');
        } else {
            element.classList.add('hide');
            element.classList.remove('show');
        }
        clearTimeout(timeout);
    }, delay);
};

/**
 * Hide element
 * @param {HTMLElement} element - Element
 * @param {Number=} delay - Delay
 */
let show = (element, delay = 0) => {
    setVisibility(element, true, delay);
};

/**
 * Show element
 * @param {HTMLElement} element - Element
 * @param {Number=} delay - Delay
 */
let hide = (element, delay = 0) => {
    setVisibility(element, false, delay);
};

/**
 * Inject CSS
 * @param {Electron.WebViewElement|HTMLElement|Electron.WebContents} webview - Electron Webview
 * @param {String} filepath - Stylesheet filepath
 * @param {Function=} callback - Callback Function
 */
let injectCSS = (webview, filepath, callback = () => {}) => {
    //logger.debug('injectStylesheet');

    fs.readFile(filepath, (err, data) => {
        if (err) {
            logger.error('injectStylesheet', err);
            return callback(err);
        }

        webview.insertCSS(data.toString());

        callback(null, filepath);
    });
};

/**
 * Adds #removeEventListener to Events
 */
EventTarget.prototype.addEventListenerBase = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function(type, listener) {
    if (!this.EventList) { this.EventList = []; }
    this.addEventListenerBase.apply(this, arguments);
    if (!this.EventList[type]) { this.EventList[type] = []; }
    const list = this.EventList[type];
    for (let index = 0; index !== list.length; index++) {
        if (list[index] === listener) { return; }
    }
    list.push(listener);
};
EventTarget.prototype.removeEventListenerBase = EventTarget.prototype.removeEventListener;
EventTarget.prototype.removeEventListener = function(type, listener) {
    if (!this.EventList) { this.EventList = []; }
    if (listener instanceof Function) { this.removeEventListenerBase.apply(this, arguments); }
    if (!this.EventList[type]) { return; }
    let list = this.EventList[type];
    for (let index = 0; index !== list.length;) {
        const item = list[index];
        if (!listener) {
            this.removeEventListenerBase(type, item);
            list.splice(index, 1);
            continue;
        } else if (item === listener) {
            list.splice(index, 1);
            break;
        }
        index++;
    }
    if (list.length === 0) { delete this.EventList[type]; }
};


/**
 * @exports
 */
module.exports = {
    addPlatformClass: addPlatformClass,
    injectCSS: injectCSS,
    isHtmlElement: isHtmlElement,
    loadScript: loadScript,
    loadStylesheet: loadStylesheet,
    setText: setText,
    setVisibility: setVisibility,
    show: show,
    hide: hide
};
