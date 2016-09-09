'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const path = require('path');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const gulp = require('gulp');
const electron = require('electron');
const electronConnect = require('electron-connect');

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const packageJson = require(path.join(appRootPath, 'package.json'));


/**
 * Paths
 * @global
 */
let appMain = path.join(appRootPath, packageJson.main);

/**
 * Electron Connect
 * @global
 */
let electronConnectServer = electronConnect.server.create({
    electron: electron,
    path: appMain,
    useGlobalElectron: false,
    verbose: false,
    stopOnClose: false,
    logLevel: 2
});

/**
 * App Sources
 * @global
 * @constant
 */
let appSources = {
    main: [
        path.join(appRootPath, 'app', 'main.js'),
        path.join(appRootPath, 'icons', '**', '*.*')
    ],
    renderer: [
        path.join(appRootPath, 'app', 'views', '*.*'),
        path.join(appRootPath, 'app', 'scripts', '*.*'),
        path.join(appRootPath, 'app', 'styles', '*.*'),
        path.join(appRootPath, 'app', 'images', '**'),
        path.join(appRootPath, 'app', 'fonts', '*.*')
    ]
};


/**
 * Task
 * Start Livereload Server
 */
gulp.task('livereload', function() {
    electronConnectServer.start();
    gulp.watch(appSources.main, ['restart:main']);
    gulp.watch(appSources.renderer, ['reload:renderer']);
});

/**
 * Task
 * Restart Main Process
 */
gulp.task('restart:main', function(done) {
    electronConnectServer.restart();
    done();
});

/**
 * Task
 * Restart Renderer Process
 */
gulp.task('reload:renderer', function(done) {
    electronConnectServer.reload();
    done();
});


gulp.task('default', ['livereload']);

