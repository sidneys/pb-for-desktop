'use strict';


/**
 * Modules: Node
 * @global
 */
const path = require('path'),
    util = require('util'),
    url = require('url');



/**
 * @global
 * @constant
 */
const moduleRoot = path.join(__dirname, '..');



/**
 * Modules: Internal
 * @global
 */
const packageJson = require(path.join(moduleRoot, 'package.json'));



/**
 * Modules: Electron
 * @global
 */
const electron = require('electron');
const { ipcRenderer, remote } = electron;



/**
 * Init
 */
let webview = document.getElementById('webview'),
    overlay = document.getElementById('overlay-spinner'),
    overlayControls = document.getElementById('overlay-controls'),
    overlayControlsHome = document.getElementById('overlay-controls-home');



/**
 * Logger
 */
let logDefault = console.log;
console.debug = function() {
    let self = this,
        packageName = packageJson.name.toUpperCase(),
        messageList = Array.from(arguments),
        messageLabel = messageList.shift(),
        messageListFormatted = util.format.apply(null, messageList);

    // Add brackets
    packageName = '[' + packageName + ']';
    messageLabel = '[' + messageLabel + ']';

    // Show in console
    logDefault.apply(self, [
        '%c%s%c%s%c %c%s', 'font-weight: bold; background: #4AB367; color: white;',
        packageName,
        'background: #4AB367; color: white; padding: 0 2px 0 0',
        messageLabel,
        '',
        'font-weight: bold',
        messageListFormatted
    ]);

    // Send to main process
    ipcRenderer.send('log', [
        messageLabel,
        messageListFormatted
    ]);
};



/**
 * Event: did-finish-load
 */
webview.addEventListener('did-finish-load', () => {
    overlay.classList.add('hidden');

    if (process.env['DEBUG']) {
        webview.openDevTools();
    }
});



/**
 * Event: new-window
 */
webview.addEventListener('new-window', (ev) => {
    let protocol = url.parse(ev.url).protocol;

    if (protocol === 'http:' || protocol === 'https:') {
        remote.shell.openExternal(ev.url);
    }

    // DEBUG
    // console.debug('Event', 'new-window', ev.url);
});



/**
 * Event: will-navigate
 */
webview.addEventListener('load-commit', (ev) => {
    let host = url.parse(ev.url).hostname;

    // DEBUG
    // console.debug('[Event]', 'will-navigate', host);

    switch (host) {
        case 'accounts.google.com':
        case 'www.facebook.com':
            overlayControls.classList.remove('hidden');
            break;
        default:
            overlayControls.classList.add('hidden');
    }
});



/**
 * Event: click
 */
overlayControlsHome.addEventListener('click', () => {
    webview.goBack();
});
