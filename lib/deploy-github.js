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
const glob = require('glob');
const _ = require('lodash');
const appRootPath = require('app-root-path').path;
const publishRelease = require('publish-release');
const ProgressBar = require('progress');
const minimist = require('minimist');

/**
 * Modules
 * Internal
 * @global
 */
const packageJson = require(path.join(appRootPath, 'package.json'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))();


/**
 * Execution environment
 * @global
 */
let isCI = process.env['CI'] || process.env['CONTINUOUS_INTEGRATION'] || process.env['APPVEYOR'] || process.env['TRAVIS'];
if (isCI) {
    logger.log('Environment', 'Continuous Integration detected.');
}

/**
 * @global
 */
let defaultTargetBranch = 'master';

/**
 * Process Environment
 * @global
 */
let envArtifactsDirectory = process.env['ARTIFACTS_DIRECTORY'] || path.join(appRootPath, packageJson.build.directories.output),
    envTargetBranch = process.env['TARGET_BRANCH'] || process.env['TRAVIS_BRANCH'] || process.env['APPVEYOR_REPO_BRANCH'],
    envGithubToken = process.env['GITHUB_TOKEN'];

/**
 * Create list of absolute paths of build artifacts
 *
 * @param {String=} directory - Directory containing assets
 * @returns {Array|undefined} List of absolute paths to files to be published
 */
let getArtifactsList = function(directory) {

    let directoryOutput = directory || envArtifactsDirectory;

    if (!_.isString(directoryOutput)) {
        return;
    }

    let installerFilePathPattern = path.join(path.resolve(directoryOutput), '**', '*.{dmg,exe,deb,zip}');
    let installerIgnorePatternList = [
        path.join(path.resolve(directoryOutput), 'mac', '*.app', '**', '*'),
        path.join(path.resolve(directoryOutput), '*-unpacked', '**', '*'),
    ];

    let installerFilePathList = glob.sync(installerFilePathPattern, { ignore: installerIgnorePatternList });

    // DEBUG
    logger.debug('installerFilePathList', installerFilePathList);

    return installerFilePathList;
};

/**
 * Create GitHub Release Configuration
 *
 * @param {Array} artifactList - List of Artifacts
 * @param {String=} targetBranch - Target Branch
 * @param {String=} githubToken - GitHub Token
 * @returns {Object|void} - Configuration Object
 */
let createGithubReleaseConfiguration = function(artifactList, targetBranch, githubToken) {

    let list = artifactList;
    let branch = targetBranch || envTargetBranch || defaultTargetBranch;
    let token = githubToken || envGithubToken;

    if (!_.isArray(list)) {
        logger.error('createGithubReleaseConfiguration', 'assetList', 'required');
        return;
    }

    if (list.length === 0) {
        logger.error('createGithubReleaseConfiguration', 'assetList', 'empty');
        return;
    }

    if (!_.isString(githubToken)) {
        logger.error('createGithubReleaseConfiguration', 'token', 'required');
        return;
    }

    if (!_.isObjectLike(packageJson)) {
        logger.error('createGithubReleaseConfiguration', 'package', 'required');
        return;
    }

    let releaseConfig = {
        target_commitish: branch,
        token: token,
        assets: artifactList,
        owner: packageJson.author.name,
        repo: packageJson.name,
        tag: 'v' + packageJson.version,
        name: packageJson.productName + ' v' + packageJson.version,
        notes: packageJson.productName + ' v' + packageJson.version,
        reuseRelease: true,
        reuseDraftOnly: false,
        draft: true,
        prerelease: true
    };

    // DEBUG
    logger.debug('createConfiguration', 'releaseConfig', releaseConfig);

    return releaseConfig;
};

/**
 * Upload Event Handler
 *
 * @param {PublishRelease} releaseObject - PublishRelease object
 * @returns {Boolean|undefined} - Result of add event handlers
 */
let registerUploadHandlers = function(releaseObject) {
    if (!releaseObject || !_.isObject(releaseObject)) {
        logger.error('addEventHandlers', 'release missing or wrong format.');
        return;
    }

    let bar = {};
    let uploaded = {};

    // Upload started
    releaseObject.on('upload-asset', function(fileName) {
        logger.log('GitHub Upload: ' + fileName, 'Starting.');
    });

    // Release created
    releaseObject.on('created-release', function() {
        logger.log('GitHub Release', 'Release created.');
    });

    // Release reused
    releaseObject.on('reuse-release', function() {
        logger.log('GitHub Release', 'Reusing existing release.');
    });

    // Upload complete
    releaseObject.on('uploaded-asset', function(fileName) {
        // Complete Progressbar
        if (bar[fileName]) {
            bar[fileName].update(1);
        }

        logger.log('GitHub Upload: ' + fileName, 'Complete.');
    });

    // Upload progress update
    releaseObject.on('upload-progress', function(fileName, event) {
        if (!uploaded[fileName]) { uploaded[fileName] = { size: 0, percentage: 0 }; }

        let currentPercentage = uploaded[fileName].percentage;

        uploaded[fileName].size += event.delta;
        uploaded[fileName].percentage = parseInt((uploaded[fileName].size / event.length) * 100);

        // Continuous Environment
        if (isCI) {
            if (currentPercentage !== uploaded[fileName].percentage) {
                logger.log('GitHub Upload: ' + fileName, uploaded[fileName].percentage + ' %');
            }
            return;
        }

        // Interactive Environment
        if (!bar[fileName]) {
            bar[fileName] = new ProgressBar(fileName + ' [:bar] :percent (ETA: :etas)', {
                complete: 'x',
                incomplete: ' ',
                width: 30,
                total: event.length,
                clear: true
            });
            return;
        }

        if (!bar[fileName].complete) {
            bar[fileName].tick(event.delta);
        }
    });

    // DEBUG
    logger.debug('registerUploadEventHandlers', 'ok');
};

/**
 * Release
 * @param {String=} artifactsDirectory - Directory containing build artifacts
 * @param {String=} targetBranch - Target Branch
 * @param {String=} githubToken - Github Token
 * @param {Function=} callback - Callback
 */
let release = function(artifactsDirectory, targetBranch, githubToken, callback) {

    // DEBUG
    logger.debug('release', 'artifactsDirectory', artifactsDirectory);
    logger.debug('release', 'targetBranch', targetBranch);
    logger.debug('release', 'githubToken', githubToken);

    let cb = callback || function() {};

    let directory = artifactsDirectory || envArtifactsDirectory;
    let branch = targetBranch || envTargetBranch || defaultTargetBranch;
    let token = githubToken || envGithubToken;

    if (!directory) { return cb(new Error('Directory required')); }
    if (!branch) { return cb(new Error('Branch required')); }
    if (!token) { return cb(new Error('Token required')); }

    // Create list of artifacts
    let artifactsList = getArtifactsList(directory);
    if (artifactsList.length === 0) { return cb(new Error(`No artifacts found at ${directory}`)); }

    // Create Configuration
    let releaseConfig = createGithubReleaseConfiguration(artifactsList, branch, token);
    if (!releaseConfig) {
        return cb(new Error('release configuration required'));
    }

    // Call publish-release module
    let release = publishRelease(releaseConfig, function(err, result) {
        if (err) {
            return cb(err);
        }
        cb(null, result);
    });

    // Add progress handlers
    registerUploadHandlers(release);
};


/**
 * Main
 */
if (require.main === module) {

    let argv = minimist(process.argv.slice(2));
    argv.directory = argv._[0];
    argv.branch = argv._[1];
    argv.token = argv._[2];

    // DEBUG
    logger.debug('args', argv);

    release(argv.directory, argv.branch, argv.token, function(err, result) {
        if (err) {
            logger.error('release', err);
            return process.exit(1);
        }

        // DEBUG
        logger.debug('release', 'result', result);

        logger.log('GitHub Release complete');
        process.exit(0);
    });
}


/**
 * @exports
 */
module.exports = {
    createArtifactsList: getArtifactsList,
    createGithubReleaseConfiguration: createGithubReleaseConfiguration,
    release: release
};
