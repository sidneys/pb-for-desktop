'use strict'


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path')

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path')

/**
 * Modules
 * Internal
 * @constant
 */
const packageJson = require(path.join(appRootPath['path'], 'package.json'))


/**
 * Manifest
 * @global
 * @constant
 */
global.manifest = {
    appId: packageJson.appId || `com.${packageJson.author}.${packageJson.name}`,
    homepage: packageJson.homepage,
    name: packageJson.name,
    productName: packageJson.productName || packageJson.name,
    version: packageJson.version
}

/**
 * Filesystem
 * @global
 * @constant
 */
global.filesystem = {
    directories: {
        resources: process.resourcesPath,
        sounds: path.join(appRootPath['path'], 'sounds').replace('app.asar', 'app.asar.unpacked')
    }
}

/**
 * State
 * @global
 */
global.state = {
    isQuitting: false
}


/**
 * @exports
 */
module.exports = global
