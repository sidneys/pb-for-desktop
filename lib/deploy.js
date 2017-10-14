'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const gitBranch = require('git-branch');
const appRootPath = require('app-root-path')['path'];
const globby = require('globby');
const isCi = require('is-ci');
const ProgressBar = require('progress');
const publishRelease = require('publish-release');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ timestamp: false });
const packageJson = require(path.join(appRootPath, 'package.json'));
const releasenotes = require(path.join(appRootPath, 'lib', 'releasenotes'));


/**
 * Filesystem
 * @constant
 * @default
 */
const installerDirectory = path.join(appRootPath, packageJson.build.directories.output);


/**
 * Release defaults
 * @const
 * @default
 */
const defaultConfiguration = {
    draft: true,
    prerelease: false,
    reuseDraftOnly: false,
    reuseRelease: true
};


/**
 * Create list of absolute paths of build artifacts
 * @returns {Array|undefined} List of absolute paths to files to be published
 */
let getArtifactFilepathList = () => {
    logger.debug('getArtifactFilepathList');

    // Find installers
    const installerPatternList = [
        `**/*${packageJson.version}*.{AppImage,deb,dmg,exe,pacman,rpm,snap,zip}`
    ];

    // Find release metadata
    const metadataPatternList = [
        '**/*.{json,yml}'
    ];

    // Exclusions
    const exclusionPatternList = [
        '!mac/*.app/**/*',
        '!*-unpacked/**/*'
    ];

    const patternList = installerPatternList.concat(metadataPatternList, exclusionPatternList);

    const filepathList = globby.sync(patternList, { absolute: true, cwd: installerDirectory });

    logger.debug('getArtifactFilepathList', 'filepathList', filepathList);

    return filepathList;
};

/**
 * Create Release Configuration
 * @returns {Object|void} - Release Configuration
 */
let getConfiguration = () => {
    logger.debug('getConfiguration');

    const artifactFilepathList = getArtifactFilepathList();

    if (artifactFilepathList.length === 0) {
        logger.error('no artifacts for release found');
        return;
    }

    /**
     * Release configuration
     */
    let releaseConfiguration = {
        assets: artifactFilepathList,
        branch: process.env.TRAVIS_BRANCH || process.env.APPVEYOR_REPO_BRANCH || gitBranch.sync(),
        name: `${packageJson.productName} v${packageJson.version}`,
        notes: releasenotes.readAsMarkdown(packageJson.version),
        tag: `v${packageJson.version}`,
        owner: packageJson.author.name || packageJson.author,
        repo: packageJson.name,
        token: process.env.GH_TOKEN
    };

    releaseConfiguration = _.defaults(releaseConfiguration, defaultConfiguration);

    logger.debug('getConfiguration', 'releaseConfiguration', releaseConfiguration);


    return releaseConfiguration;
};

/**
 * Add upload progress event handler
 * @param {Object} publishReleaseObject - PublishRelease object
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
    publishReleaseObject.on('upload-asset', (fileName) => {
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
    publishReleaseObject.on('uploaded-asset', (fileName) => {
        // Complete Progressbar
        if (bar[fileName]) {
            bar[fileName].update(1);
        }

        logger.info('release', `upload complete: ${fileName}`);
    });

    // Upload progress update
    publishReleaseObject.on('upload-progress', (fileName, event) => {
        if (!uploaded[fileName]) { uploaded[fileName] = { size: 0, percentage: 0 }; }

        let currentPercentage = uploaded[fileName].percentage;

        uploaded[fileName].size += event['delta'];
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
            bar[fileName].tick(event['delta']);
        }
    });
};

/**
 * Deploys all Release artifacts
 * @param {Function=} callback - Callback
 */
let deployLatestRelease = (callback = () => {}) => {
    logger.debug('deployLatestRelease');

    // Create Configuration
    let releaseConfiguration = getConfiguration();
    if (!releaseConfiguration) {
        callback(new Error('releaseConfiguration missing.'));
        return;
    }

    // Call publish-release module
    let publishReleaseHandler = publishRelease(releaseConfiguration, (error, result) => {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result);
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

    deployLatestRelease((error, result) => {
        if (error) {
            logger.error(error);
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
    getConfiguration: getConfiguration,
    getArtifacts: getArtifactFilepathList
};
