'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const path = require('path')

/**
 * Modules (Node.js)
 * @constant
 */
const appRootPath = require('app-root-path')
const appModulePath = require('app-module-path')

/**
 * Module Configuration
 */
appRootPath.setPath(path.resolve(path.join(__dirname), '..', '..'))
appModulePath.addPath(appRootPath.path)


/**
 * Initialize Main Process
 */
require('app/scripts/main-process')
