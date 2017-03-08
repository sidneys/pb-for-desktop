'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @constant
 */
const deployGithub = require(path.join(appRootPath, 'lib', 'deploy-github'));
const logger = require(path.join(appRootPath, 'lib', 'logger'))();
const packageJson = require(path.join(appRootPath, 'package.json'));
const platformHelper = require(path.join(appRootPath, 'lib', 'platform-helper'));


/**
 * Filesystem
 * @constant
 * @default
 */
const builderPath = path.join(appRootPath, 'node_modules', '.bin', 'build');


/**
 * Renames installers to <name>-<version>-<arch>
 */
let renameArtifacts = () => {
    // Get list of artifacts
    let artifactsList = deployGithub.createArtifactsList();

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
            logger.log('renamed installer', `'${path.basename(currentFilepath)}'  -->  '${newFilename}${currentExtension}'`);
        }
    });
};


/**
 * Main
 * wraps electron-builder
 */
let main = () => {
    logger.log('building', platformHelper.type);

    // macOS
    if (platformHelper.isMacOS) {
        childProcess.execSync(`${builderPath} --macos --x64`, { cwd: appRootPath, stdio: [0, 1, 2] });
    }

    // Windows
    if (platformHelper.isWindows) {
        childProcess.execSync(`"${builderPath}" --windows --x64`, { cwd: appRootPath, stdio: [0, 1, 2] });
    }

    // Linux
    if (platformHelper.isLinux) {
        childProcess.execSync(`${builderPath} --linux --ia32 --x64 --armv7l`, { cwd: appRootPath, stdio: [0, 1, 2] });
    }

    // Rename
    renameArtifacts();
};


/**
 * Main
 */
if (require.main === module) {
    main();

    process.exit(0);
}
