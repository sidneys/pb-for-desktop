'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const path = require('path')

/**
 * Modules (Third party)
 * @constant
 */
const appRootPathDirectory = require('app-root-path').path

/**
 * Modules (Local)
 * @constant
 */
const packageJson = require(path.join(appRootPathDirectory, 'package.json'))


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
        sounds: path.join(appRootPathDirectory, 'sounds').replace('app.asar', 'app.asar.unpacked')
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
