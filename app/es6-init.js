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


/**
 * Set Application Root
 */
appRootPath.setPath(path.join(__dirname, '..'));


/**
 * Init
 */
electronCompile.init(appRootPath.path, './scripts/components/application');
