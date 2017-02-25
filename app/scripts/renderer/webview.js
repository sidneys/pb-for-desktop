'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const path = require('path');
const url = require('url');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const { remote }  = require('electron');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;
const electronConnect = require('electron-connect');
const parseDomain = require('parse-domain');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
// const connectivityService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'connectivity-service'));
const dom = require(path.join(appRootPath, 'app', 'scripts', 'utils', 'dom'));
const isDebug = require(path.join(appRootPath, 'lib', 'is-debug'));
const isLivereload = require(path.join(appRootPath, 'lib', 'is-livereload'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });


/**
 * DOM Components
 * @global
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
let presentSpinner = function() {
    dom.setVisibility(spinner, true, 1000);
};

/**
 * Dismiss Spinner
 */
let dismissSpinner = function() {
    dom.setVisibility(spinner, false, 1000);
};


// /** @listens connectivityService#on */
// connectivityService.on('online', () => {
//     logger.debug('webview', 'connectivityService:online');
//
//     dismissSpinner();
// });
//
// /** @listens connectivityService#on */
// connectivityService.on('offline', () => {
//     logger.debug('webview', 'connectivityService:offline');
//
//     presentSpinner();
// });


/** @listens webview:dom-ready */
webview.addEventListener('dom-ready', () => {
    // Register Platform
    dom.addPlatformClass();

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

/** @listens webview:did-fail-load */
webview.addEventListener('did-fail-load', () => {
    logger.debug('webview', 'webview:did-fail-load');

    // if (!connectivityService.online) {
        presentSpinner();
    // }
});

/** @listens webview:did-finish-load */
webview.addEventListener('did-finish-load', () => {
    logger.debug('webview', 'webview:did-finish-load');

    // if (connectivityService.online) {
        dismissSpinner();
    // }
});

/** @listens webview:new-window */
webview.addEventListener('new-window', (ev) => {
    let protocol = url.parse(ev.url).protocol;

    if (protocol === 'http:' || protocol === 'https:') {
        remote.shell.openExternal(ev.url);
    }
});

/** @listens webview#on */
webview.addEventListener('load-commit', (ev) => {
    if (!parseDomain(ev.url)) { return; }

    let domain = parseDomain(ev.url).domain || '';
    let subdomain = parseDomain(ev.url).subdomain || '';
    let path = url.parse(ev.url).path || '';

    switch (domain) {
        case 'google':
        case 'youtube':
        case 'facebook':
            dom.setVisibility(controls, true);

            body.style.backgroundColor = 'rgb(236, 240, 240)';
            break;
        case 'pushbullet':
            // Pushbullet 'help'
            if (subdomain.includes('help')) {
                dom.setVisibility(controls, true);
            } else {
                dom.setVisibility(controls, false);
            }

            // Pushbullet 'signin'
            if (path.includes('signin')) {
                body.style.backgroundColor = 'rgb(236, 240, 240)';
            } else {
                body.style.backgroundColor = 'transparent';
            }
    }
});

