#!/usr/bin/env node
'use strict'


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path')
const childProcess = require('child_process')
const os = require('os')

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash')
const appRootPath = require('app-root-path')
const readPkg = require('read-pkg')
const simpleReload = require('simple-reload')
const detectInstalled = require('detect-installed')
/**
 * Modules
 * Configuration
 */
appRootPath.setPath(path.join(__dirname, '..'))

/**
 * Modules
 * Internal
 * @constant
 */
const packageJson = require(path.join(appRootPath.path, 'package.json'))
const logger = require('@sidneys/logger')({ write: false })

/**
 * Filesystem
 * @constant
 * @default
 */
const applicationPath = path.join(appRootPath.path, packageJson.main)


/**
 * Reads dependencies, devDependencies, peerDependencies, bundleDependencies
 * from package.json and returns them as an Array in shorthand format (name@version).
 * @param {String=} targetDirectory - Path to the root of an analysed module.
 * @returns {String[]}
 */
let readPackageDependencies = (targetDirectory = appRootPath.path) => {
    logger.debug('readPackageDependencies', targetDirectory)

    const packageJson = readPkg.sync({ cwd: targetDirectory })

    const dependenciesTreeList = _(packageJson).pickBy((v, k) => k.match(/dependencies/gi)).values().value()
    const unifiedDependenciesTree = _.merge(...dependenciesTreeList)
    // const semverList = _(unifiedDependenciesTree).map((v, k) => `${k}@${v}`).value()
    const nameList = _(unifiedDependenciesTree).map((v, k) => k).value()

    return nameList
}

/**
 * Install Packages
 * @param {String=} targetDirectory - Path to the root of an analysed module.
 * @param {Function=} callback  - Callback
 */
let installPackages = (targetDirectory, callback = () => {}) => {
    logger.debug('installPackages')

    // Determine Missing Package Names
    const packageNameList = _(readPackageDependencies(targetDirectory))
    const unresolvedPackageNameList = packageNameList.filter(packageName => !detectInstalled.sync(packageName, { local: true }))

    unresolvedPackageNameList.forEach((packageName, index, array) => {
        logger.debug('npm install', packageName)

        // npm install
        // childProcess.execSync(`npm install ${unresolvedPackageName}`, {
        const npm = childProcess.spawn(`npm`, [ 'install', packageName ], {
            cwd: appRootPath.path
        })

        npm.stdout.on('data', (data) => {
            data.toString().trim().split(os.EOL).forEach(line => logger.info('npm', line))
        })
        npm.stderr.on('data', (data) => {
            data.toString().trim().split(os.EOL).forEach(line => logger.error('npm', line))
        })

        npm.on('close', (code) => {
            if (index === array.length - 1) {
                logger.info(`Installing Packages complete.`)
                callback()
            }
        })

        // // npm install
        // childProcess.execSync(`npm install ${unresolvedPackageName}`, {
        //     cwd: appRootPath.path,
        //     stdio: 'inherit'
        // })
        //
        // // Las Iteration
        // if (index === array.length - 1) {
        //     logger.info(`Installing Packages complete.`)
        //     callback()
        // }
    })
}

/**
 * Wait until Package is available
 * @param {String} packageName - Package Name
 * @param {Function=} callback - Callback
 */
let waitForPackage = (packageName, callback = () => {}) => {
    logger.debug('waitForPackage')

    // Wait until Package is ready
    const interval = setInterval(() => {
        const packagePath = simpleReload(packageName)

        if (!packagePath) { return }

        // Callback
        callback(packagePath)
        clearInterval(interval)
    }, 2000)
}

/**
 * Launch Package
 * @param {String} packagePath - Package Path
 * @param {Array=} launchArguments - Launch Arguments
 */
let launchPackage = (packagePath, launchArguments) => {
    logger.debug('launchPackage')

    // Launch Application
    logger.info('Launching Application', appRootPath.path)

    const child = childProcess.spawn(packagePath, launchArguments, {
        cwd: appRootPath.path,
        detached: true,
        stdio: 'ignore'
    })

    // Fork
    child.unref()

    // Exit
    process.exit(0)
}


/**
 * Handle Start as (global) CLI Module
 */
if (require.main === module) {
    installPackages(appRootPath.path, () => {
        waitForPackage('electron', (packagePath) => {
            launchPackage(packagePath, [ applicationPath ])
        })
    })
}
