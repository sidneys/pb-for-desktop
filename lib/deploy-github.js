'use strict';


/**
 * Modules: Node
 * @global
 */
const path = require('path');


/**
 * Modules: Third Party
 * @global
 */
const glob = require('glob'),
    _ = require('lodash'),
    publishRelease = require('publish-release'),
    ProgressBar = require('progress'),
    minimist = require('minimist');


/**
 * Modules: Internal
 * @global
 */
const moduleRoot = path.join(__dirname, '..'),
    packageJson = require(path.join(moduleRoot, 'package.json')),
    logger = require(path.join(moduleRoot, 'lib', 'logger'));


/**
 * Execution environment
 * @constant
 * @global
 */
const isCI = process.env['CI'];


/**
 * Defaults
 * @constant
 * @global
 */
const defaultTargetBranch = 'master';


/**
 * Process Environment
 * @constant
 * @global
 */
const envArtifactsDirectory = process.env['ARTIFACTS_DIRECTORY'],
    envTargetBranch = process.env['TARGET_BRANCH'] || process.env['TRAVIS_BRANCH'] || process.env['APPVEYOR_REPO_BRANCH'],
    envGithubToken = process.env['GITHUB_TOKEN'];

/**
 * Create list of absolute paths of build artifacts
 *
 * @param {String=} dir - Directory containing assets
 * @returns {Array|undefined} List of absolute paths to files to be published
 */
let createArtifactList = function(dir) {

    if (!_.isString(dir)){
        return;
    }

    let sourceDir = dir,
        sourcePattern = path.join(path.resolve(sourceDir), '*.*'),
        list = glob.sync(sourcePattern);

    // DEBUG
    logger.debug('getArtifactList', 'sourceDir', sourceDir);
    logger.debug('getArtifactList', 'sourcePattern', sourcePattern);
    logger.debug('getArtifactList', 'list', list);

    return list;
};


/**
 * Create GitHub Release Configuration
 *
 * @param {Array} artifactList - List of Artifacts
 * @param {String=} targetBranch - Target Branch
 * @param {String=} githubToken - GitHub Token
 * @returns {Object|void} - Configuration Object
 */
let createReleaseConfig = function(artifactList, targetBranch, githubToken) {

    let list = artifactList,
        branch = targetBranch || envTargetBranch || defaultTargetBranch,
        token = githubToken || envGithubToken,
        pkg = packageJson;

    if (!_.isArray(list)) {
        logger.error('createReleaseConfig', 'assetList', 'required');
        return;
    }

    if (list.length === 0) {
        logger.error('createReleaseConfig', 'assetList', 'empty');
        return;
    }

    if (!_.isString(githubToken)) {
        logger.error('createReleaseConfig', 'token', 'required');
        return;
    }

    if (!_.isObjectLike(pkg)) {
        logger.error('createReleaseConfig', 'package', 'required');
        return;
    }

    let releaseConfig = {
        target_commitish: branch,
        token: token,
        assets: artifactList,
        owner: pkg.author.name,
        repo: pkg.name,
        tag: 'v' + pkg.version,
        name: pkg.build.productName + ' v' + pkg.version,
        notes: pkg.build.productName + ' v' + pkg.version,
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

    let bar;

    releaseObject.on('created-release', function() {
        logger.log('GitHub Release created');
    });

    releaseObject.on('reuse-release', function() {
        logger.log('Reusing existing GitHub Release');
    });

    releaseObject.on('upload-asset', function(name) {
        logger.log('Uploading artifact to GitHub Release', name);
    });

    releaseObject.on('uploaded-asset', function(name) {
        if (bar) {
            bar.update(1);
        }
        logger.log('Completed uploading artifact', name);
    });

    releaseObject.on('upload-progress', function(name, event) {
        if (!bar) {
            bar = new ProgressBar(name + ' [:bar] :percent (ETA: :etas)', {
                complete: 'x',
                incomplete: ' ',
                width: 30,
                total: event.length,
                clear: true
            });
            return;
        }

        if (!bar.complete) {
            bar.tick(event.delta);
        }
    });

    // DEBUG
    logger.debug('registerUploadEventHandlers', 'ok');
};


/**
 * Main Method
 *
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

    let directory = artifactsDirectory || envArtifactsDirectory,
        branch = targetBranch || envTargetBranch || defaultTargetBranch,
        token = githubToken || envGithubToken;

    // Create list of artifacts
    let list = createArtifactList(directory);
    if (!list) {
        return cb(new Error('artifactsDirectory required'));
    }

    // Create Configuration
    let releaseConfig = createReleaseConfig(list, branch, token);
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

    // Check environment type
    if (isCI) {
        logger.log('Continuous integration environment detected');
    }
};


/**
 * Initialize default process if called from CLI
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
    createArtifactList: createArtifactList,
    createReleaseConfig: createReleaseConfig,
    release: release
};
