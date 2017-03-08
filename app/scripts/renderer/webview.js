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
const { remote } = require('electron');

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path').path;
const electronConnect = require('electron-connect');
const isReachable = require('is-reachable');
const parseDomain = require('parse-domain');

/**
 * Modules
 * Internal
 * @constant
 */
const domHelper = require(path.join(appRootPath, 'app', 'scripts', 'utils', 'dom-helper'));
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const isLivereload = require(path.join(appRootPath, 'lib', 'is-livereload'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });

/**
 * @constant
 * @default
 */
const defaultHostname = 'www.pushbullet.com';


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
    domHelper.setVisibility(spinner, true, 1000);
};

/**
 * Dismiss Spinner
 */
let dismissSpinner = () => {
    domHelper.setVisibility(spinner, false, 1000);
};


/**
 * @listens webview#dom-ready
 */
webview.addEventListener('dom-ready', () => {
    // Register Platform
    domHelper.addPlatformClass();

    // Bind Controls
    for (let i in buttons) {
        buttons[i].target.addEventListener('click', buttons[i].event);
    }

    if (isDebug) {
        webview.openDevTools({ detach: true });
    }

    // Livereload
    if (isLivereload) {
        electronConnect.client.create();
    }
});

/**
 * @listens webview#did-fail-load
 */
webview.addEventListener('did-fail-load', () => {
    logger.debug('webview#did-fail-load');

    presentSpinner();
    // isReachable(defaultHostname).then((reachable) => {
    //     logger.debug('webview#did-fail-load', 'reachable', reachable);
    //
    //     if (reachable) {
    //         presentSpinner();
    //     }
    // });
});

/**
 * @listens webview#did-finish-load
 */
webview.addEventListener('did-finish-load', () => {
    logger.debug('webview#did-finish-load');

    dismissSpinner();
    // isReachable(defaultHostname).then((reachable) => {
    //     logger.debug('webview#did-finish-load', 'reachable', reachable);
    //
    //     if (reachable) {
    //         dismissSpinner();
    //     }
    // });
});

/**
 * @listens webview#new-window
 */
webview.addEventListener('new-window', (ev) => {
    let protocol = url.parse(ev.url).protocol;

    if (protocol === 'http:' || protocol === 'https:') {
        remote.shell.openExternal(ev.url);
    }
});

/**
 * @listens webview#load-commit
 */
webview.addEventListener('load-commit', (ev) => {
    if (!parseDomain(ev.url)) { return; }

    let domain = parseDomain(ev.url).domain || '';
    let subdomain = parseDomain(ev.url).subdomain || '';
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
