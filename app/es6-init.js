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
const appRootPath = require('app-root-path');
const electronCompile = require('electron-compile');
const EventEmitter = require('events');


/**
 * Set Application Root
 * @global
 */
appRootPath.setPath(path.join(__dirname, '..'));

/**
 * Set maximum Event listeners
 * @global
 * @see https://github.com/feross/webtorrent/issues/889
 */
EventEmitter.defaultMaxListeners = Infinity;


/**
 * Init
 */
electronCompile.init(appRootPath.path, './scripts/components/application');
