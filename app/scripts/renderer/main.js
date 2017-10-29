'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');
const url = require('url');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { ipcRenderer, remote } = electron;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
const logger = require('@sidneys/logger')({ write: true });
const parseDomain = require('parse-domain');

/**
 * Modules
 * Internal
 * @constant
 */
const domTools = require('@sidneys/dom-tools');
const configurationManager = remote.require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));


/**
 * Filesystem
 * @constant
 */
const stylesheetFilepath = path.join(appRootPath, 'app', 'styles', 'injected', 'pushbullet-web.css');


/**
 * Retrieve ShowAppBadgeCount
 * @return {Boolean} - Show
 */
let retrieveAppShowBadgeCount = () => configurationManager('appShowBadgeCount').get();


/**
 * DOM Components
 * @constant
 */
const body = document.querySelector('body');
const webviewViewElement = document.querySelector('#webview');
const spinnerViewElement = document.querySelector('#spinner');
const spinnerTextElement = document.querySelector('#spinner__text');
const supplementalMenuElement = document.querySelector('#supplemental-menu');
const buttons = {
    home: {
        element: document.querySelector('.supplemental-menu__button.home'),
        action: () => {
            webviewViewElement.goBack();
        }
    }
};

/**
 * Register navigation
 */
let didRegisterNavigation = false;
let registerNavigation = () => {
    logger.debug('registerNavigation');

    if (didRegisterNavigation) { return; }

    Object.keys(buttons).forEach((title) => {
        buttons[title].element.addEventListener('click', () => {
            logger.debug('button', 'click', title);
            buttons[title].action(buttons[title].element);
        });
    });

    didRegisterNavigation = true;
};

/**
 * Offline handler
 */
let onOffline = () => {
    logger.debug('onOffline');

    // Show Spinner
    domTools.show(spinnerViewElement);
};

/**
 * Online handler
 */
let onOnline = () => {
    logger.debug('onOnline');

    // Bind Controls
    registerNavigation();

    // Hide Spinner
    domTools.hide(spinnerViewElement);
};

/**
 * Login handler
 */
let onLogin = () => {
    logger.debug('onLogin');

    domTools.setText(spinnerTextElement, 'logged in');
};

/**
 * Set application badge count
 * @param {Number} total - Number to set
 *
 */
let updateBadge = (total) => {
    logger.debug('updateBadge');

    if (!retrieveAppShowBadgeCount()) { return; }

    remote.app.setBadgeCount(total);
};


/**
 * @listens ipcRenderer#zoom
 */
ipcRenderer.on('zoom', (event, direction) => {
    logger.debug('ipcRenderer#zoom', 'direction', direction);

    const webContents = remote.getCurrentWebContents();

    switch (direction) {
        case 'in':
            webContents.getZoomLevel(level => webContents.setZoomLevel(level + 1));
            break;
        case 'out':
            webContents.getZoomLevel(level => webContents.setZoomLevel(level - 1));
            break;
        case 'reset':
            webContents.setZoomLevel(0);
    }
});


/**
 * @listens webviewViewElement#did-fail-load
 */
webviewViewElement.addEventListener('did-fail-load', () => {
    logger.debug('webviewViewElement#did-fail-load');

    onOffline();
});

/**
 * @listens webviewViewElement#did-navigate-in-page
 */
webviewViewElement.addEventListener('did-navigate-in-page', (event) => {
    logger.debug('webviewViewElement#did-navigate-in-page');

    let hash = url.parse(event.url).hash;

    if (!retrieveAppShowBadgeCount()) { return; }

    switch (hash) {
        case '#devices':
        case '#following':
        case '#people':
        case '#sms':
            updateBadge(0);
            break;
    }

    logger.debug('webviewViewElement#did-navigate-in-page', 'url', event.url);
});

/**
 * @listens webviewViewElement#dom-ready
 */
webviewViewElement.addEventListener('dom-ready', () => {
    logger.debug('webviewViewElement#dom-ready');

    domTools.injectCSS(webviewViewElement, stylesheetFilepath);
});

/** @namespace event.args */
/** @namespace event.channel */

/**
 * @listens webviewViewElement#ipc-message
 */
webviewViewElement.addEventListener('ipc-message', (event) => {
    logger.debug('playerViewElement#ipc-message', 'channel', event.channel, 'args', event.args.join());

    switch (event.channel) {
        // Online
        case 'online':
            const isOnline = event.args[0];

            isOnline === true ? onOnline() : onOffline();

            break;
        // Login
        case 'login':
            const isLogin = event.args[0];

            isLogin === true ? onLogin() : void 0;

            break;
    }
});

/**
 * @listens webviewViewElement#load-commit
 */
webviewViewElement.addEventListener('load-commit', (event) => {
    logger.debug('webviewViewElement#load-commit');

    domTools.injectCSS(webviewViewElement, stylesheetFilepath);

    if (!parseDomain(event.url)) { return; }

    let domain = parseDomain(event.url)['domain'] || '';
    let subdomain = parseDomain(event.url)['subdomain'] || '';
    let urlpath = url.parse(event.url).path || '';

    // User did not sign in
    switch (domain) {
        case 'google':
        case 'youtube':
        case 'facebook':
            domTools.setVisibility(supplementalMenuElement, true);

            body.style.backgroundColor = 'rgb(236, 240, 240)';
            break;
        case 'pushbullet':
            // Pushbullet 'help'
            if (subdomain.includes('help')) {
                domTools.setVisibility(supplementalMenuElement, true);
            } else {
                domTools.setVisibility(supplementalMenuElement, false);
            }

            // Pushbullet 'signin'
            if (urlpath.includes('signin')) {
                body.style.backgroundColor = 'rgb(236, 240, 240)';
            } else {
                body.style.backgroundColor = 'transparent';
            }
    }
});

/**
 * @listens webviewViewElement#new-window
 */
webviewViewElement.addEventListener('new-window', (event) => {
    logger.debug('webviewViewElement#new-window');

    event.preventDefault();

    let domain = parseDomain(event.url)['domain'] || '';

    if (domain === 'pushbullet') {
        // Internal Link
        logger.info('webviewViewElement#new-window', 'opening internal url:', event.url);
        webviewViewElement.loadURL(event.url);
    } else {
        // External Link
        logger.info('webviewViewElement#new-window', 'opening external url:', event.url);
        remote.shell.openExternal(event.url);
    }
});


/**
 * @listens window#Event:load
 */
window.addEventListener('load', () => {
    logger.debug('window#load');

    // Add Platform CSS
    domTools.addPlatformClass();
});