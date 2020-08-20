'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const os = require('os')
const path = require('path')

/**
 * Modules (Third party)
 * @constant
 */
const appRootPathDirectory = require('app-root-path').path
const logger = require('@sidneys/logger')({ write: true })
const electronSettings = require('electron-settings')
const isDebug = require('@sidneys/is-env')('debug')
const platformTools = require('@sidneys/platform-tools')

/**
 * Modules (Local)
 * @constant
 */
const packageJson = require(path.join(appRootPathDirectory, 'package.json'))

/**
 * Global Application Manifest
 * @global
 * @constant
 * @namespace global.appManifest
 */
global.appManifest = {
    appId: packageJson.appId || `com.${packageJson.author}.${packageJson.name}`,
    homepage: packageJson.homepage,
    name: packageJson.name,
    productName: packageJson.productName || packageJson.name,
    version: packageJson.version
}

/**
 * Global Application Filesystem
 * @global
 * @constant
 * @namespace global.appFilesystem
 */
global.appFilesystem = {
    resources: process.resourcesPath,
    settings: path.join(path.dirname(electronSettings.file()), `${packageJson.name}.json`),
    sounds: path.join(appRootPathDirectory, 'sounds').replace('app.asar', 'app.asar.unpacked'),
    tempdir: (isDebug && process.defaultApp) ? path.join(appRootPathDirectory, 'temp') : os.tmpdir(),
    logs: logger.getConfiguration().logfile,
    icon: path.join(appRootPathDirectory, 'icons', platformTools.type, `icon${platformTools.iconImageExtension(platformTools.type)}`)
}

/**
 * @exports
 */
module.exports = global
