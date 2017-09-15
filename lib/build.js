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
const globby = require('globby');
const hashFiles = require('hash-files');
const minimist = require('minimist');
const YAML = require('yamljs');

/**
 * Modules
 * Internal
 * @constant
 */
const deploy = require(path.join(appRootPath, 'lib', 'deploy'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ timestamp: false });
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));
const releasenotes = require(path.join(appRootPath, 'lib', 'releasenotes'));


/**
 * Application
 * @constant
 * @default
 */
const appProductName = packageJson.productName || packageJson.name;

/**
 * Filesystem
 * @constant
 * @default
 */
const electronBuildScript = path.join(appRootPath, 'node_modules', '.bin', 'build');
const installerDirectory = path.join(appRootPath, packageJson.build.directories.output);


/**
 * Glob patterns for application files
 * @see [electron-builder](https://www.electron.build/file-patterns)
 * @constant
 * @default
 */
const basePatternList = ['**/*'];
const exclusionPatternList = packageJson.build.files;


/** @namespace fs.renameSync */

/**
 * Renames installers to <name>-<version>-<arch>
 */
let renameArtifacts = () => {
    logger.debug('renameArtifacts');

    // Get release configuration
    const releaseConfiguration = deploy.getConfiguration();

    if (!releaseConfiguration) {
        logger.error('releaseConfiguration required');
        return;
    }


    // Lookup assets
    releaseConfiguration.assets.forEach((assetFilepath) => {
        let currentExtension = path.extname(assetFilepath);
        let currentDirectory = path.dirname(assetFilepath);

        let newFilename = path.basename(assetFilepath, currentExtension);
        // convert: lowercase
        newFilename = _.toLower(newFilename);
        // replace: productName > name
        newFilename = newFilename.replace(packageJson.productName, packageJson.name);
        // remove: version
        // newFilename = _(newFilename).replace(packageJson.version, '');
        // replace: whitespace -> underscore -> hyphen
        newFilename = newFilename.replace(/ /g, '_');
        newFilename = newFilename.replace(/_/g, '-');
        // remove: consecutive special characters
        newFilename = newFilename.replace(/\s\s+/g, ' ');
        newFilename = newFilename.replace(/[-]+/g, '-');
        newFilename = newFilename.replace(/[_]+/g, '_');
        // trim: special characters
        newFilename = _(newFilename).trim(' ');
        newFilename = _(newFilename).trim('-');
        newFilename = _(newFilename).trim('_');

        let newFilepath = path.join(currentDirectory, `${newFilename}${currentExtension}`);

        if (assetFilepath !== newFilepath) {
            fs.renameSync(assetFilepath, newFilepath);
            logger.debug('renamed installer', `'${path.basename(assetFilepath)}'  -->  '${newFilename}${currentExtension}'`);
        }
    });
};

/** @namespace fs.mkdirpSync */
/** @namespace fs.writeFileSync */

/**
 * Generates Release Metadata (latest-mac.json, latest.yml)
 */
let writeMetadata = () => {
    logger.debug('writeMetadata');

    // Get release configuration
    const releaseConfiguration = deploy.getConfiguration();

    if (!releaseConfiguration) {
        logger.error('releaseConfiguration required');
        return;
    }

    // Lookup assets
    releaseConfiguration.assets.forEach((assetFilepath) => {
        /**
         * Write latest-mac.json
         */
        if (assetFilepath.includes('-mac.zip')) {
            const content = {
                releaseDate: new Date().toISOString(),
                releaseName: releaseConfiguration.name,
                releaseNotes: releaseConfiguration.notes,
                url: `https://github.com/${releaseConfiguration.owner}/${releaseConfiguration.repo}/releases/download/${releaseConfiguration.tag}/${path.basename(assetFilepath)}`,
                version: _(releaseConfiguration.tag).trim('v')
            };

            const file = path.join(installerDirectory, 'github', 'latest-mac.json');

            fs.mkdirpSync(path.dirname(file));
            fs.writeFileSync(file, JSON.stringify(content, null, 2));

            logger.debug('writeMetadata', path.relative(appRootPath, file));
        }

        /**
         * Write latest.yml
         */
        if (path.extname(assetFilepath) === '.exe') {
            const content = {
                releaseDate: new Date().toISOString(),
                releaseName: releaseConfiguration.name,
                releaseNotes: releaseConfiguration.notes,
                githubArtifactName: path.basename(assetFilepath),
                path: path.basename(assetFilepath),
                sha2: hashFiles.sync({ algorithm: 'sha256', files: [assetFilepath] }),
                version: _(releaseConfiguration.tag).trim('v')
            };

            const file = path.join(installerDirectory, 'latest.yml');

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
        child_process.execSync(`${electronBuildScript} --${targetName} --ia32 --x64`, {
            cwd: appRootPath,
            stdio: [0, 1, 2]
        });
    });

    // Rename
    logger.info('renaming artifacts', `for ${targetList.length} platforms`);
    renameArtifacts();
};

/** @namespace fs.existsSync */
/** @namespace fs.ensureDirSync */
/** @namespace fs.unlinkSync */

/**
 * Copy instead of overwriting
 * @param {Array=} platformNameList - List of platforms to build
 * @param {Boolean} skipModules - Do not copy 'node_modules' folder
 * @param {function(*)} callback - Platforms to build
 */
let copyPlatform = (platformNameList, skipModules, callback = () => {}) => {
    logger.debug('copyPlatform');

    const copyPatternList = basePatternList.concat(exclusionPatternList);
    const deletePatternList = basePatternList;

    if (skipModules) {
        copyPatternList.push('!**/node_modules/**/*');
        deletePatternList.push('!**/node_modules/**/*');
        logger.info('copying', `skipping copy of 'node_modules'`);
    }


    platformNameList.forEach((platformName) => {
        logger.info('copying', platformName);

        platformName = platformName === 'darwin' ? 'macos' : platformName;
        platformName = platformName === 'win32' ? 'windows' : platformName;

        /**
         * macOS
         */

        if (platformName !== 'macos') {
            logger.warn('copying only supported on platform macOS');
            return;
        }

        // Lookup electron app path within package
        const applicationPackage = path.join(installerDirectory, 'mac', `${appProductName}.app`);
        const packageDirectory = path.join(applicationPackage, 'Contents', 'Resources', 'app');

        if (!fs.existsSync(applicationPackage)) {
            callback(new Error(`could not locate ${applicationPackage}`));
            return;
        }

        if (!fs.existsSync(packageDirectory)) {
            callback(new Error(`could not locate Electron './app' folder within ${applicationPackage}`));
            return;
        }

        // Create helper directory for deletion glob to (match at least 1)
        fs.ensureDirSync(path.join(packageDirectory, 'temp'));

        // Delete: start
        logger.debug('copyPlatform', 'delete', 'deletePatternList', deletePatternList);
        logger.info('copying', 'looking up files to delete');
        globby(deletePatternList, { cwd: packageDirectory, dot: false }).then((filepathList) => {

            logger.info('copying', `starting deletion of ${filepathList.length} files`);
            filepathList.forEach((filepath, filepathIndex) => {
                const source = path.join(packageDirectory, filepath);
                logger.debug('copyPlatform', 'delete', path.relative(appRootPath, source));

                fs.removeSync(source);

                // Delete: last file
                if (filepathIndex === filepathList.length - 1) {
                    logger.info('copying', `delete complete`);

                    // Copy: start
                    logger.debug('copyPlatform', 'copy', 'copyPatternList', copyPatternList);
                    logger.info('copying', 'looking up files to copy');
                    globby(copyPatternList, { cwd: appRootPath, dot: false }).then((filepathList) => {
                        logger.info('copying', `starting copy of ${filepathList.length} files`);
                        let lastPercentage = 0;
                        filepathList.forEach((filepath, filepathIndex) => {
                            const source = path.join(appRootPath, filepath);
                            const target = path.join(packageDirectory, filepath);
                            // logger.debug('copyPlatform', 'copy', path.relative(appRootPath, source), '->', path.relative(appRootPath, target));

                            fs.copySync(source, target, { dereference: true, overwrite: true });

                            const percentage = Math.floor((filepathIndex / filepathList.length) * 100);
                            if ((percentage > lastPercentage) && (percentage % 10 === 0)) {
                                lastPercentage = percentage;
                                logger.info('copying', `completed ${percentage}%`);
                            }

                            // Copy: last file
                            if (filepathIndex === filepathList.length - 1) {
                                logger.info('copying', `copy complete`);

                                callback(null, filepathList.length);
                            }
                        });
                    }).catch(error => callback(error));
                }
            });
        }).catch(error => callback(error));
    });
};


/**
 * Init
 * @param {Boolean=} metadata - Generate latest-mac.json, latest.yml
 * @param {Boolean=} releasenotes - Update release notes
 * @param {Boolean=} copy - Copy
 * @param {Boolean=} skip-modules - Skip modules
 */
if (require.main === module) {
    let argv;
    let targetList = [];

    try {
        argv = minimist(JSON.parse(process.env.npm_config_argv).original, {
            'boolean': ['macos', 'windows', 'linux', 'metadata', 'releasenotes', 'copy', 'skip-modules'],
            'unknown': () => { return false; }
        });

        targetList = Object.keys(argv).filter((prop) => {
            return argv[prop] === true && prop !== 'metadata' && prop !== 'releasenotes' && prop !== 'copy' && prop !== 'skip-modules';
        });

        targetList = targetList.length === 0 ? [platformHelper.type] : targetList;
    } catch (err) {}

    // Overwrite built packages
    if (argv.copy) {
        return copyPlatform(targetList, argv['skip-modules'], (error, result) => {
            if (error) {
                logger.error(error);
            }
            logger.info('copy platform complete', result);
        });
    }

    // Generate RELEASENOTES.md
    logger.info('generating release notes');
    releasenotes.writeAsMarkdown();

    // Build platforms
    buildPlatform(targetList);

    // Generate latest.yml
    logger.info('generating metadata');
    writeMetadata();
}

/**
 * @exports
 */
module.exports = {
    copy: copyPlatform
};

