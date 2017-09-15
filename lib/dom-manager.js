'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path')['path'];
const CleanCSS = require('clean-css');
const fileUrl = require('file-url');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });
const language = require(path.join(appRootPath, 'lib', 'language'));


/**
 * @constant
 * @default
 */
const defaultDebounce = 50;


/**
 * Add platform name as class to element
 * @param {HTMLElement=} element - Element (Default: <html>)
 */
let addPlatformClass = (element = document.querySelector('html')) => {

    // Add nodejs platform name
    element.classList.add(process.platform);

    // Add readable platform name
    switch (process.platform) {
        case 'darwin':
            element.classList.add('macos');
            element.classList.add('osx');
            element.classList.add('platform--darwin');
            break;
        case 'win32':
            element.classList.add('windows');
            element.classList.add('win');
            element.classList.add('platform--win32');
            break;
        case 'linux':
            element.classList.add('unix');
            break;
    }
};

/**
 * Get background-image url attribute
 * @param {String} url - Image url
 * @return {String} background-image url
 */
let backgroundUrl = (url) => `url("${url}")`;

/**
 * Get child item index
 * @param {HTMLElement} element - Element
 * @return {Number} Index
 */
let getElementIndex = (element) => {
    const childList = element.parentNode.childNodes;

    let index = 0;
    for (index; index < childList.length; index++) {
        if (element === childList[index]) {break;}
    }

    return index;
};

/**
 * Inject CSS
 * @param {Electron.webviewTag|HTMLElement|Electron.WebContents} webview - Electron Webview
 * @param {String|Array} stylesheets - Stylesheet(s) filepath
 * @param {Function=} callback - Callback Function
 */
let injectCSS = (webview, stylesheets, callback = () => {}) => {
    logger.debug('injectCSS');

    let stylesheetList = Array.isArray(stylesheets) ? stylesheets : [stylesheets];

    // Retrieve list of already injected stylesheets
    const codeAlreadyInjectedStylesheetList = `document.querySelector('html').dataset.injectcss`;
    webview.executeJavaScript(codeAlreadyInjectedStylesheetList, false, (result) => {
        const alreadyInjectedStylesheetList = result ? JSON.parse(result) : void 0;
        // Filtering redundant stylesheets
        // Create difference array of already injected files and new list of filter ()
        if (alreadyInjectedStylesheetList && Array.isArray(alreadyInjectedStylesheetList)) {
            stylesheetList = stylesheetList.filter((stylesheet) => alreadyInjectedStylesheetList.indexOf(stylesheet) < 0);
        }

        // Empty CSS string
        let css = '';

        stylesheetList.forEach((filepath, index, list) => {
            fs.readFile(filepath, 'utf-8', (err, data) => {
                if (err) {
                    logger.error('injectCSS', err);
                    return callback(err);
                }

                // Concat, trim
                css = css + os.EOL + data.toString();
                css = css.trim();

                // Inject
                if (index === (list.length - 1)) {
                    // Minify
                    const minified = new CleanCSS().minify(css);

                    logger.debug('injectCSS', `Minified stylesheets (${(minified.stats.efficiency * 100).toFixed(2)}% size reduction)`);
                    // Insert
                    webview.insertCSS(minified.styles);

                    // Store list of injected stylesheets
                    const codeInjectedStylesheetList = `document.querySelector('html').dataset.injectcss = JSON.stringify([ '${stylesheetList.join(`', '`) }' ])`;
                    webview.executeJavaScript(codeInjectedStylesheetList, false, () => {
                        callback(null, minified.styles);
                    });
                }
            });
        });

    });
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
 * Check if descendant elements of a given list have been scrolled into view, given a fixed percentage threshold.
 * @param {NodeList} elementList - Element to test
 * @param {Number=} threshold - Percentage of list after which loading starts
 * @param {Number} fixedCount - Use a fixed base list item count instead of the actual item count, e.g. for dynamically growing lists.
 * @returns {Boolean|void}
 */
let didScrollIntoViewport = (elementList, threshold = 0.75, fixedCount = elementList.length) => {
    logger.debug('shouldLoadMore');

    if (elementList.length === 0) { return; }

    // Calculated on basis of percentage of length
    let targetIndex = Math.floor(elementList.length - (1 - threshold) * fixedCount);

    const targetElement = elementList[targetIndex - 1];
    const targetElementRect = targetElement.getBoundingClientRect();

    // DEBUG
    // targetElement.style.background = 'red';

    return targetElementRect.top <= document.documentElement.clientHeight;
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
 * Remove element from DOM
 * @param {HTMLElement} element - Element
 * @param {Number=} delay - Delay
 */
let remove = function(element, delay = 0) {
    logger.debug('remove');

    let timeout = setTimeout(() => {
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }

        clearTimeout(timeout);
    }, delay);
};

/**
 * Remove all event listeners
 * @param {HTMLElement} element - Element
 */
let removeEventListeners = (element) => {
    logger.debug('remove');

    const elementClone = element.cloneNode(true);

    if (element.parentNode) {
        element.parentNode.replaceChild(elementClone, element);
    }
};

/**
 * Keep elements at same size
 * @param {HTMLElement} source - Source element
 * @param {HTMLElement} target - Target element
 */
let scaleToFill = (source, target) => {
    //logger.debug('scaleToFill');

    let debounce = _.debounce(() => {
        source.style.height = target.clientHeight + 'px';
        source.style.width = target.clientWidth + 'px';
    }, defaultDebounce);

    debounce();
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
 * Show element
 * @param {HTMLElement} element - Element
 * @param {Number=} delay - Delay
 */
let hide = (element, delay = 0) => {
    setVisibility(element, false, delay);
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
    backgroundUrl: backgroundUrl,
    didScrollIntoViewport: didScrollIntoViewport,
    getElementIndex: getElementIndex,
    injectCSS: injectCSS,
    isHtmlElement: isHtmlElement,
    loadScript: loadScript,
    loadStylesheet: loadStylesheet,
    remove: remove,
    removeEventListeners: removeEventListeners,
    scaleToFill: scaleToFill,
    setText: setText,
    setVisibility: setVisibility,
    hide: hide,
    show: show
};
