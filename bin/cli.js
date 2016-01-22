#!/usr/bin/env node


/**
 * Modules: Node
 * @global
 */
var path = require('path'),
    childProcess = require('child_process');

/**
 * Modules: External
 * @global
 */
var electronPath = require('electron-prebuilt');

/**
 * Modules: Internal
 * @global
 */
var moduleRoot = path.join(__dirname, '..'),
    packageJson = require(path.join(moduleRoot, 'package.json'));

/**
 * Path to Electron application
 * @global
 */
var appMain = path.join(moduleRoot, packageJson.main);


// Run
childProcess.spawn(electronPath, [ appMain ], {
    stdio: 'inherit'
});
