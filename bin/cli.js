#!/usr/bin/env node
'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const path = require('path');
const childProcess = require('child_process');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;
const electron = require('electron');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const packageJson = require(path.join(appRootPath, 'package.json'));


/**
 * Path to Electron application
 * @global
 */
let appMain = path.join(appRootPath, packageJson.main);


/**
 * Init
 */
childProcess.spawn(electron, [ appMain ], {
    stdio: 'inherit'
});
