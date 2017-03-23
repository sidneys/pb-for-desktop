'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');
const url = require('url');
const util = require('util');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { remote } = electron;

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
const domHelper = require(path.join(appRootPath, 'app', 'scripts', 'renderer', 'utils', 'dom-helper'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });


/**
 * DOM Components
 * @constant
 */
const body = document.querySelector('body');
const webview = document.getElementById('webview');
const spinner = document.getElementById('spinner');
const controls = document.getElementById('controls');
const buttons = {
    home: {
        target: document.querySelector('.controls__button.home'),
        event() { webview.goBack(); }
    }
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
 * @listens webview#new-window
 */
webview.addEventListener('new-window', (ev) => {
    logger.debug('webview#new-window');

    let protocol = url.parse(ev.url).protocol;

    if (protocol === 'http:' || protocol === 'https:') {
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
    let path = url.parse(ev.url).path || '';

    switch (domain) {
        case 'google':
        case 'youtube':
        case 'facebook':
            domHelper.setVisibility(controls, true);

            body.style.backgroundColor = 'rgb(236, 240, 240)';
            break;
        case 'pushbullet':
            // Pushbullet 'help'
            if (subdomain.includes('help')) {
                domHelper.setVisibility(controls, true);
            } else {
                domHelper.setVisibility(controls, false);
            }

            // Pushbullet 'signin'
            if (path.includes('signin')) {
                body.style.backgroundColor = 'rgb(236, 240, 240)';
            } else {
                body.style.backgroundColor = 'transparent';
            }
    }
});

/**
 * @listens webview#ipc-message
 */
webview.addEventListener('ipc-message', (ev) => {
    logger.debug('webview#ipc-message', util.inspect(ev));

    const channel = ev.channel;
    const message = ev.args[0];
    const parameter = ev.args[1];

    logger.debug('webview#ipc-message', 'channel:', channel, 'message:', message, 'parameter:', parameter);

    switch (channel) {
        case 'network':
            switch (message) {
                case 'offline':
                    logger.info('network', 'offline');
                    presentSpinner();
                    break;
                case 'online':
                    logger.info('network', 'online');
                    if (Boolean(parameter)) {
                        logger.info('network', 'reconnecting');
                        webview.reloadIgnoringCache();
                    }
                    dismissSpinner();
                    break;
            }
    }
});
