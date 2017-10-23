/**
 * Modules
 * Node
 * @constant
 */
'use strict';


const fs = require('fs-extra');
const os = require('os');
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path')['path'];
const json2md = require('json2md');
const removeMarkdown = require('remove-markdown');

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ timestamp: false });
const packageJson = require(path.join(appRootPath, 'package.json'));


/**
 * Filesystem
 * @constant
 * @default
 */
const filename = 'RELEASENOTES';
const inputFilepath = path.join(appRootPath, `${filename}.json`);
const outputFilepath = path.join(appRootPath, `${filename}.md`);


/**
 * @typedef {Object} ReleaseNotes
 * @property {String[]} features
 * @property {String[]} bugfixes
 * @property {String[]} documentation
 * @property {String[]} internals
 */
/**
 * @typedef {String} ReleaseNotesVersion
 */
/**
 * @typedef {Object.<ReleaseNotesVersion, ReleaseNotes>} ReleaseNotesCollection
 */

/** @namespace fs.readFileSync */

/**
 * Read release notes object from RELEASENOTES.json
 * @param {String=} version - Specific version
 * @returns {Object|void} - Release notes object
 * @namespace fs
 *
 * @private
 */
let readJson = (version) => {
    logger.debug('readJson');

    let notesVersionsObject;

    try {
        notesVersionsObject = JSON.parse(fs.readFileSync(inputFilepath).toString());
    } catch (err) {
        logger.error(`could not parse release notes`, inputFilepath);
    }

    if (version) {
        Object.keys(notesVersionsObject).forEach((notesVersion) => {
            if (notesVersion !== packageJson.version) {
                delete notesVersionsObject[notesVersion];
            }
        })
    }

    return notesVersionsObject;
};

/**
 * Transform single release note object to markdown format
 * @param {ReleaseNotes} versionObject - Release notes object
 * @returns {Array} - Markdown-formatted line feed for release notes object
 *
 * @private
 */
let transformItemToMarkdown = (versionObject) => {
    logger.debug('transformItemToMarkdown');

    let lineList = [];

    Object.keys(versionObject).forEach((value) => {
        lineList.push(json2md({ h4: _.startCase(value) }));

        let entryContent = { ul: [] };
        versionObject[value].forEach((note) => {
            entryContent.ul.push(note);
        });

        lineList.push(json2md(entryContent) + os.EOL);
    });

    return lineList;
};

/**
 * Transform release notes collection to markdown format
 * @param {ReleaseNotesCollection} collection - Hash Map of release notes objects
 * @returns {String} - Markdown-formatted release notes collection
 *
 * @private
 */
let transformCollectionToMarkdown = (collection) => {
    logger.debug('transformCollectionToMarkdown');

    let collectionList = [];

    Object.keys(collection).forEach((version) => {
        collectionList.push(json2md({ h2: version }) + os.EOL);
        collectionList = collectionList.concat(transformItemToMarkdown(collection[version]));
    });

    return collectionList.join('');
};

/** @namespace fs.writeFileSync */

/**
 * Write RELEASENOTES.json as RELEASENOTES.md
 * @param {String=} version - Specific version
 */
let writeAsMarkdown = (version) => {
    logger.debug('writeAsMarkdown');

    // Write as to disk
    fs.writeFileSync(outputFilepath, transformCollectionToMarkdown(readJson(version)));

    logger.info('created release notes', outputFilepath);
};

/**
 * Read as Markdown
 * @param {String=} version - Specific version
 * @returns {String} - Markdown release notes
 */
let readAsMarkdown = (version) => {
    logger.debug('readAsMarkdown');

    return transformCollectionToMarkdown(readJson(version));
};

/**
 * Read as Plaintext
 * @param {String=} version - Specific version
 * @returns {String} - Plaintext release notes
 */
let readAsPlaintext = (version) => {
    logger.debug('readAsPlaintext');

    return removeMarkdown(readAsMarkdown(version));
};


/**
 * Main
 */
if (require.main === module) {
    writeAsMarkdown();
}


/**
 * @exports
 */
module.exports = {
    writeAsMarkdown: writeAsMarkdown,
    readAsMarkdown: readAsMarkdown,
    readAsPlaintext: readAsPlaintext
};
