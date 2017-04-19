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
const parseDomain = require('parse-domain');

/**
 * Modules
 * Internal
 * @constant
 */
const configurationManager = require(path.join(appRootPath, 'app', 'scripts', 'main', 'managers', 'configuration-manager'));
const domHelper = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'utils', 'dom-helper'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });


/**
 * DOM Components
 * @constant
 */
const body = document.querySelector('body');
const webview = document.getElementById('webview');
const spinner = document.getElementById('spinner');
const statustext = document.getElementById('spinner__text');
const controlsExtra = document.getElementById('controls-extra');
const buttons = {
    home: {
        target: document.querySelector('.controls-extra__button.home'),
        event() { webview.goBack(); }
    }
};

/**
 * Set application badge count
 * @param {Number} total - Number to set
 *
 */
let updateBadge = (total) => {
    logger.debug('updateBadge');

    if (Boolean(configurationManager('showBadgeCount').get()) === false) { return; }

    remote.app.setBadgeCount(total);
};

/**
 * Present Spinner
 */
let presentSpinner = () => {
    logger.debug('presentSpinner');

    domHelper.setVisibility(spinner, true, 1000);
};

/**
 * Dismiss Spinner
 */
let dismissSpinner = () => {
    logger.debug('dismissSpinner');

    domHelper.setVisibility(spinner, false, 1000);
};


/**
 * @listens webview#dom-ready
 */
webview.addEventListener('dom-ready', () => {
    logger.debug('webview#dom-ready');

    // Register Platform
    domHelper.addPlatformClass();

    // Bind Controls
    for (let i in buttons) {
        buttons[i].target.addEventListener('click', buttons[i].event);
    }
});

/**
 * @listens webview#did-fail-load
 */
webview.addEventListener('did-fail-load', () => {
    logger.debug('webview#did-fail-load');

    presentSpinner();
});

/**
 * @listens webview#did-finish-load
 */
webview.addEventListener('did-finish-load', () => {
    logger.debug('webview#did-finish-load');

    //dismissSpinner();
});

/**
 * @listens webview#did-navigate-in-page
 */
webview.addEventListener('did-navigate-in-page', (ev) => {
    logger.debug('webview#did-navigate-in-page');

    let hash = url.parse(ev.url).hash;

    if (Boolean(configurationManager('showBadgeCount').get()) === false) { return; }

    switch (hash) {
        case '#devices':
        case '#following':
        case '#people':
        case '#sms':
            updateBadge(0);
            break;
    }

    logger.debug('webview#did-navigate-in-page', 'url', ev.url);
});

/**
 * @listens webview#new-window
 */
webview.addEventListener('new-window', (ev) => {
    logger.debug('webview#new-window');

    ev.preventDefault();

    let domain = parseDomain(ev.url)['domain'] || '';

    if (domain === 'pushbullet') {
        // Internal Link
        logger.info('webview#new-window', 'opening internal url:', ev.url);
        webview.loadURL(ev.url);
    } else {
        // External Link
        logger.info('webview#new-window', 'opening external url:', ev.url);
        remote.shell.openExternal(ev.url);
    }
});

/**
 * @listens webview#load-commit
 */
webview.addEventListener('load-commit', (ev) => {
    logger.debug('webview#load-commit');

    if (!parseDomain(ev.url)) { return; }

    let domain = parseDomain(ev.url)['domain'] || '';
    let subdomain = parseDomain(ev.url)['subdomain'] || '';
    let urlpath = url.parse(ev.url).path || '';

    // Pre/Post signin ui amendments
    switch (domain) {
        case 'google':
        case 'youtube':
        case 'facebook':
            domHelper.setVisibility(controlsExtra, true);

            body.style.backgroundColor = 'rgb(236, 240, 240)';
            break;
        case 'pushbullet':
            // Pushbullet 'help'
            if (subdomain.includes('help')) {
                domHelper.setVisibility(controlsExtra, true);
            } else {
                domHelper.setVisibility(controlsExtra, false);
            }

            // Pushbullet 'signin'
            if (urlpath.includes('signin')) {
                body.style.backgroundColor = 'rgb(236, 240, 240)';
            } else {
                body.style.backgroundColor = 'transparent';
            }
    }

    // HTTP Status Monitor
    // webview.getWebContents().session.webRequest.onHeadersReceived((details, callback) => {
    //     logger.debug('request', 'url:', details.url, 'statusCode:', details.statusCode);
    //     callback({cancel: false });
    // });
});

/**
 * CSS Injection
 * @listens webview#load-commit
 */
webview.addEventListener('load-commit', () => {
    logger.debug('webview#load-commit');

    domHelper.injectCSS(webview, path.join(appRootPath, 'app', 'styles', 'pushbullet.css'));
});

/**
 * @listens ipcRenderer#zoom
 */
ipcRenderer.on('zoom', (ev, level) => {
    logger.debug('ipcRenderer#zoom', 'level:', level);

    switch (level) {
        case 'in':
            webview.getWebContents().getZoomLevel(zoomLevel => {
                webview.setZoomLevel(zoomLevel + 1);
            });
            break;
        case 'out':
            webview.getWebContents().getZoomLevel(zoomLevel => {
                webview.setZoomLevel(zoomLevel - 1);
            });
            break;
        case 'reset':
            webview.getWebContents().setZoomLevel(0);
    }
});

/**
 * @listens webview#ipc-message
 */
webview.addEventListener('ipc-message', (ev) => {
    logger.debug('webview#ipc-message');
    //console.dir(ev);

    logger.debug('webview#ipc-message', 'channel:', ev.channel, 'args:', ev.args.join());

    const channel = ev.channel;
    const message = ev.args[0];

    switch (channel) {
        case 'account':
            switch (message) {
                case 'login':
                    logger.info('account', 'login');
                    domHelper.setText(statustext, 'logged in');
                    break;
            }
            break;
        case 'network':
            const didDisconnect = ev.args[1];
            switch (message) {
                case 'offline':
                    logger.info('network', 'offline');
                    presentSpinner();
                    domHelper.setText(statustext, 'connecting...');
                    break;
                case 'online':
                    logger.info('network', 'online');
                    domHelper.setText(statustext, 'connected');
                    if (Boolean(didDisconnect)) {
                        logger.info('network', 'reconnecting...');
                        domHelper.setText(statustext, 'reconnecting');
                        webview.reloadIgnoringCache();
                    }
                    dismissSpinner();
                    break;
            }
    }
});
