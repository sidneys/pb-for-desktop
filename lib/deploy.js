'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');
const util = require('util');

/**
 * Modules
 * External
 * @constant
 */
const gitBranch = require('git-branch');
const appRootPath = require('app-root-path')['path'];
const glob = require('glob');
const isCi = require('is-ci');
const minimist = require('minimist');
const ProgressBar = require('progress');
const publishRelease = require('publish-release');
const _ = require('lodash');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ timestamp: false });
const packageJson = require(path.join(appRootPath, 'package.json'));
const releasenotes = require(path.join(appRootPath, 'lib', 'releasenotes'));


/**
 * GitHub
 * @const
 * @default
 */
const defaults = {
    branch: process.env.DEPLOY_BRANCH || process.env.TARGET_BRANCH || process.env.TRAVIS_BRANCH || process.env.APPVEYOR_REPO_BRANCH || gitBranch.sync(),
    directory: process.env.DEPLOY_DIRECTORY || path.join(appRootPath, packageJson.build.directories.output),
    releaseName: process.env.DEPLOY_RELEASENAME || packageJson.productName + ' v' + packageJson.version,
    releaseNotes: releasenotes.getLatest(),
    releaseTag: process.env.DEPLOY_TAG || 'v' + packageJson.version,
    owner: process.env.DEPLOY_OWNER || packageJson.author.name || packageJson.author,
    repository: process.env.DEPLOY_REPOSITORY || packageJson.name,
    token: process.env.DEPLOY_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
};


/**
 * Create list of absolute paths of build artifacts
 * @param {String=} directory - Directory containing assets
 * @returns {Array|undefined} List of absolute paths to files to be published
 */
let getArtifactsList = function(directory) {
    logger.debug('getArtifactsList');

    const artifactsDirectory = directory || defaults.directory;

    if (!_.isString(artifactsDirectory)) {
        logger.error('getArtifactsList', 'artifactsDirectory', 'missing');
        return;
    }

    let installerFilePathPattern = path.join(path.resolve(artifactsDirectory), '**', '*.{AppImage,deb,dmg,exe,json,pacman,rpm,yml,zip}');
    let installerIgnorePatternList = [
        path.join(path.resolve(artifactsDirectory), 'mac', '*.app', '**', '*'),
        path.join(path.resolve(artifactsDirectory), '*-unpacked', '**', '*')
    ];

    const artifactsList = glob.sync(installerFilePathPattern, { ignore: installerIgnorePatternList }) || [];

    // DEBUG
    logger.debug('getArtifactsList', 'installerFilePathList', artifactsList);

    return artifactsList;
};

/**
 * Get deploy defaults
 * @returns {Object} defaults
 */
let getDefaults = function() {
    logger.debug('getDefaults');

    return defaults;
};

/**
 * Create Release Configuration
 * @param {Array} artifacts - List of Artifacts
 * @param {String} token - GitHub Token
 * @param {String=} branch - Release Branch
 * @param {String=} name - Release Name
 * @param {String=} notes - Release Notes
 * @param {String=} tag - Release Tag
 * @returns {Object|void} - Configuration Object
 */
let getConfiguration = function(artifacts, token, branch, name, notes, tag) {
    logger.debug('getConfiguration');

    const artifactList = artifacts || [];

    const releaseBranch = branch || defaults.branch;
    const githubToken = token || defaults.token;

    const releaseName = name || defaults.releaseName;
    const releaseNotes = notes || defaults.releaseNotes;
    const releaseTag = tag || defaults.releaseTag;

    const owner = defaults.owner;
    const repository = defaults.repository;

    if (artifactList.length === 0) {
        logger.error('getConfiguration', 'artifactList', 'empty');
        return;
    }

    if (!_.isString(releaseBranch)) {
        logger.error('getConfiguration', 'releaseBranch', 'missing');
        return;
    }

    if (!_.isString(githubToken)) {
        logger.error('getConfiguration', 'githubToken', 'missing');
        return;
    }

    if (!_.isString(releaseNotes)) {
        logger.error('getConfiguration', 'releaseNotes', 'missing');
        return;
    }

    if (!_.isObjectLike(packageJson)) {
        logger.error('getConfiguration', 'package', 'missing');
        return;
    }

    let releaseConfiguration = {
        assets: artifactList,
        draft: true,
        name: releaseName,
        notes: releaseNotes,
        owner: owner,
        prerelease: false,
        repo: repository,
        reuseDraftOnly: false,
        reuseRelease: true,
        tag: releaseTag,
        target_commitish: releaseBranch,
        token: githubToken
    };

    logger.debug('getConfiguration', util.inspect(releaseConfiguration));

    return releaseConfiguration;
};

/**
 * Add upload progress event handler
 * @param {PublishRelease} publishReleaseObject - PublishRelease object
 * @returns {Boolean|void} - Result of add event handlers
 */
let addProgressHandlers = (publishReleaseObject) => {
    logger.debug('addProgressHandlers');

    if (!publishReleaseObject || !_.isObject(publishReleaseObject)) {
        logger.error('addProgressHandlers', 'release missing or wrong format.');
        return;
    }

    let bar = {};
    let uploaded = {};

    // Upload started
    publishReleaseObject.on('upload-asset', function(fileName) {
        logger.info('release', `upload started: ${fileName}`);
    });

    // Release created
    publishReleaseObject.on('created-release', () => {
        logger.info('release', 'created');
    });

    // Release reused
    publishReleaseObject.on('reuse-release', () => {
        logger.info('release', 're-using');
    });

    // Upload complete
    publishReleaseObject.on('uploaded-asset', function(fileName) {
        // Complete Progressbar
        if (bar[fileName]) {
            bar[fileName].update(1);
        }

        logger.info('release', `upload complete: ${fileName}`);
    });

    // Upload progress update
    publishReleaseObject.on('upload-progress', function(fileName, event) {
        if (!uploaded[fileName]) { uploaded[fileName] = { size: 0, percentage: 0 }; }

        let currentPercentage = uploaded[fileName].percentage;

        uploaded[fileName].size += event.delta;
        uploaded[fileName].percentage = parseInt((uploaded[fileName].size / event.length) * 100);

        // Continuous Environment
        if (isCi) {
            if (currentPercentage !== uploaded[fileName].percentage) {
                logger.info('release', `uploading: ${fileName} (${uploaded[fileName].percentage} %)`);
            }
            return;
        }

        // Interactive Environment
        if (!bar[fileName]) {
            bar[fileName] = new ProgressBar(`'Release uploading: ${fileName} [:bar] :percent (ETA: :etas)`, {
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
};

/**
 * Deploys all Release artifacts
 * @param {String=} directory - Directory containing build artifacts
 * @param {String=} token - Github Token
 * @param {String=} branch - Target Branch
 * @param {String=} name - Release Name
 * @param {String=} notes - Release Notes
 * @param {String=} tag - Release Tag
 * @param {Function=} callback - Callback
 */
let deployRelease = function(directory, token, branch, name, notes, tag, callback) {
    logger.debug('deployRelease');

    let cb = callback || function() {};

    // Create list of artifacts
    let artifactsList = getArtifactsList(directory);
    if (artifactsList.length === 0) {
        cb(new Error('artifactsList empty.'));
        return;
    }

    // Create Configuration
    let releaseConfiguration = getConfiguration(artifactsList, token, branch, name, notes, tag);
    if (!releaseConfiguration) {
        cb(new Error('releaseConfiguration missing.'));
        return;
    }

    // Call publish-release module
    let publishReleaseHandler = publishRelease(releaseConfiguration, function(err, result) {
        if (err) {
            cb(err);
            return;
        }

        cb(null, result);
    });

    // Add progress handlers
    addProgressHandlers(publishReleaseHandler);
};

/**
 * Main
 *
 * @public
 */
let main = () => {
    logger.debug('main');

    const argv = minimist(process.argv.slice(2));
    argv.directory = argv._[0];
    argv.token = argv._[1];
    argv.branch = argv._[2];
    argv.name = argv._[3];
    argv.notes = argv._[4];
    argv.tag = argv._[5];

    deployRelease(argv.directory, argv.token, argv.branch, argv.name, argv.notes, argv.tag, function(err, result) {
        if (err) {
            logger.error(err);
            return process.exit(1);
        }

        logger.log('release complete');
        logger.debug('result', result);

        process.exit(0);
    });
};


/**
 * Main
 */
if (require.main === module) {
    main();
}


/**
 * @exports
 */
module.exports = {
    github: {
        defaults: getDefaults(),
        getConfiguration: getConfiguration,
        getArtifacts: getArtifactsList,
        release: deployRelease
    }
};
