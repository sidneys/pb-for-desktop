'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const electron = require('electron');
const { app } = electron;

/**
 * Modules
 * External
 * @constant
 */
const appRootPath = require('app-root-path');
const electronConnect = require('electron-connect');
const gulp = require('gulp');

/**
 * Modules
 * Configuration
 */
appRootPath.setPath(path.join(__dirname));

/**
 * Modules
 * Internal
 * @constant
 */
const packageJson = require(path.join(appRootPath['path'], 'package.json'));


/**
 * Filesystem
 * @constant
 * @default
 */
const applicationPath = path.join(appRootPath['path'], packageJson.main);

/**
 * Electron Connect Server
 * Init
 */
const electronConnectServer = electronConnect.server.create({
    //logLevel: 2,
    //verbose: true,
    stopOnClose: true,
    electron: electron,
    path: applicationPath,
    useGlobalElectron: false
});

/**
 * Electron Connect Server
 * Files
 */
let appSources = {
    main: [
        path.join(appRootPath['path'], 'app', 'fonts', '**', '*.*'),
        path.join(appRootPath['path'], 'app', 'html', '**', '*.*'),
        path.join(appRootPath['path'], 'app', 'images', '**', '*.*'),
        path.join(appRootPath['path'], 'app', 'scripts', 'main', '**', '*.*'),
        path.join(appRootPath['path'], 'app', 'styles', '**', '*.*'),
        path.join(appRootPath['path'], 'package.json')
    ],
    renderer: [
        path.join(appRootPath['path'], 'app', 'scripts', 'renderer', '**', '*.*')
    ]
};


/**
 * Server
 * start
 */
gulp.task('livereload', () => {
    electronConnectServer.start();
    gulp.watch(appSources.main, ['main:restart']);
    gulp.watch(appSources.renderer, ['renderer:reload']);
});

/**
 * Main Process
 * restart
 */
gulp.task('main:restart', (callback) => {
    electronConnectServer.restart();
    callback();
});

/**
 * Renderer Process
 * restart
 */
gulp.task('renderer:reload', (callback) => {
    electronConnectServer.reload();
    callback();
});


gulp.task('default', ['livereload']);

