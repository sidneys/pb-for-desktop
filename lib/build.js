'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const child_process = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path')['path'];
const hashFiles = require('hash-files');
const minimist = require('minimist');
const YAML = require('yamljs');

/**
 * Modules
 * Internal
 * @constant
 */
const deploy = require(path.join(appRootPath, 'lib', 'deploy')).github;
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ timestamp: false });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const releasenotes = require(path.join(appRootPath, 'lib', 'releasenotes'));


/**
 * Filesystem
 * @constant
 * @default
 */
const builderPath = path.join(appRootPath, 'node_modules', '.bin', 'build');

/**
 * GitHub
 * @const
 * @default
 */
const artifactsDirectory = process.env.DEPLOY_DIRECTORY || path.join(appRootPath, packageJson.build.directories.output);

/**
 * GitHub
 * @const
 * @default
 */
const defaults = {
    metadata: process.env.BUILD_METADATA,
    releasenotes: process.env.BUILD_RELEASENOTES
};


/**
 * Renames installers to <name>-<version>-<arch>
 */
let renameArtifacts = () => {
    logger.debug('renameArtifacts');

    // Get list of artifacts
    let artifactsList = deploy.getArtifacts();

    // Rename
    artifactsList.forEach((currentFilepath) => {
        let currentExtension = path.extname(currentFilepath);
        let currentDirectory = path.dirname(currentFilepath);

        let newFilename = path.basename(currentFilepath, currentExtension);
        // convert: lowercase
        newFilename = _.toLower(newFilename);
        // replace: productName > name
        newFilename = _(newFilename).replace(packageJson.productName, packageJson.name);
        // remove: version
        // newFilename = _(newFilename).replace(packageJson.version, '');
        // replace: whitespace -> underscore -> hyphen
        newFilename = _(newFilename).replace(/ /g, '_');
        newFilename = _(newFilename).replace(/_/g, '-');
        // remove: consecutive special characters
        newFilename = _(newFilename).replace(/\s\s+/g, ' ');
        newFilename = _(newFilename).replace(/[-]+/g, '-');
        newFilename = _(newFilename).replace(/[_]+/g, '_');
        // trim: special characters
        newFilename = _(newFilename).trim(' ');
        newFilename = _(newFilename).trim('-');
        newFilename = _(newFilename).trim('_');

        let newFilepath = path.join(currentDirectory, `${newFilename}${currentExtension}`);

        if (currentFilepath !== newFilepath) {
            fs.renameSync(currentFilepath, newFilepath);
            logger.debug('renamed installer', `'${path.basename(currentFilepath)}'  -->  '${newFilename}${currentExtension}'`);
        }
    });
};

/**
 * Generates Release Metadata (latest-mac.json, latest.yml)
 */
let writeMetadata = () => {
    logger.debug('writeMetadata');

    const artifactsList = deploy.getArtifacts();

    if (artifactsList.length === 0) {
        logger.error('writeMetadata', 'no artifacts found');
        return;
    }

    artifactsList.forEach((artifactFilepath) => {
        /**
         * latest-mac.json
         */
        if (artifactFilepath.includes('-mac.zip')) {
            const content = {
                releaseDate: new Date().toISOString(),
                releaseName: deploy.defaults.releaseName,
                releaseNotes: releasenotes.getLatest(),
                url: `https://github.com/${deploy.defaults.owner}/${deploy.defaults.repository}/releases/download/v${packageJson.version}/${path.basename(artifactFilepath)}`,
                version: packageJson.version
            };

            const file = path.join(artifactsDirectory, 'github', 'latest-mac.json');

            fs.mkdirpSync(path.dirname(file));
            fs.writeFileSync(file, JSON.stringify(content, null, 2));

            logger.debug('writeMetadata', path.relative(appRootPath, file));
        }

        /**
         * latest.yml
         */
        if (path.extname(artifactFilepath) === '.exe') {
            const content = {
                githubArtifactName: path.basename(artifactFilepath),
                path: path.basename(artifactFilepath),
                releaseDate: new Date().toISOString(),
                releaseName: deploy.defaults.releaseName,
                releaseNotes: releasenotes.getLatest(),
                sha2: hashFiles.sync({ algorithm: 'sha256', files: [artifactFilepath] }),
                version: packageJson.version
            };

            const file = path.join(artifactsDirectory, 'latest.yml');

            fs.mkdirpSync(path.dirname(file));
            fs.writeFileSync(file, YAML.stringify(content, 2));

            logger.debug('writeMetadata', path.relative(appRootPath, file));
        }
    });
};


/**
 * Main, wraps electron-builder
 * @param {Array=} targetList - Platforms to build
 */
let buildPlatform = (targetList) => {
    logger.debug('main');

    targetList.forEach((targetName) => {
        logger.info('building platform', targetName);

        targetName = targetName === 'darwin' ? 'macos' : targetName;
        targetName = targetName === 'win32' ? 'windows' : targetName;
        child_process.execSync(`${builderPath} --${targetName} --ia32 --x64`, { cwd: appRootPath, stdio: [0, 1, 2] });
    });

    // Rename
    logger.info('renaming artifacts', `for ${targetList.length} platforms`);
    renameArtifacts();
};


/**
 * Init
 * @param {Boolean=} metadata - Generate latest-mac.json, latest.yml
 * @param {Boolean=} releasenotes - Update release notes
 */
if (require.main === module) {
    let argv;
    let targetList = [];

    try {
        argv = minimist(JSON.parse(process.env.npm_config_argv).original, {
            'boolean': ['macos', 'windows', 'linux', 'metadata', 'releasenotes'],
            'unknown': () => { return false; }
        });

        targetList = Object.keys(argv).filter((prop) => {
            return argv[prop] === true && prop !== 'metadata' && prop !== 'releasenotes';
        });

        targetList = targetList.length === 0 ? [platformHelper.type] : targetList;
    } catch (err) {}

    buildPlatform(targetList);

    if (argv['metadata'] || !!defaults.metadata) {
        logger.info('generating metadata', `for ${targetList.length} platforms`);
        writeMetadata();
    }

    if (argv['releasenotes'] || !!defaults.releasenotes) {
        logger.info('updating release notes');
        releasenotes.update();
    }
}
