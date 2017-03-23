/**
 * Modules
 * Node
 * @constant
 */
'use strict';


const fs = require('fs-extra');
const json2md = require('json2md');
const os = require('os');
const path = require('path');

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash');
const appRootPath = require('app-root-path')['path'];

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
 * Release Notes Template
 * @constant
 * @default
 */
const releasenotesTemplate = {
    'features': [],
    'bugfixes': [],
    'documentation': [],
    'internals': []
};


/**
 * Transform Release Notes Object to markdown
 * @param {Object} releasenotesObject - Release Notes object
 * @returns {Array} - Markdown lines
 */
let transformToMarkdown = (releasenotesObject) => {
    logger.debug('transformToMarkdown');

    let markdownList = [];

    Object.keys(releasenotesObject).forEach((value) => {
        markdownList.push(json2md({ h4: _.startCase(value) }));

        let entryContent = { ul: [] };
        releasenotesObject[value].forEach((note) => {
            entryContent.ul.push(note);
        });

        markdownList.push(json2md(entryContent) + os.EOL);
    });

    return markdownList;
};

/**
 * Write release notes to disk
 *
 * @public
 */
let updateFile = () => {
    logger.debug('writeReleasenotes');

    let notesVersionsList = [];
    let notesVersionsObject = {};
    let notesVersionsText;

    // Read from RELEASENOTES.json
    try {
        notesVersionsObject = JSON.parse(fs.readFileSync(inputFilepath).toString());
    } catch (err) {
        logger.error(`release notes file read error:`, inputFilepath);
        return;
    }

    // Parse RELEASENOTES.json
    Object.keys(notesVersionsObject).forEach((version) => {
        notesVersionsList.push(json2md({ h2: version }) + os.EOL);
        notesVersionsList = notesVersionsList.concat(transformToMarkdown(notesVersionsObject[version]));
    });

    notesVersionsText = notesVersionsList.join(os.EOL);

    // Write to RELEASENOTES.md
    fs.writeFileSync(outputFilepath, notesVersionsText);

    logger.info('release notes updated:', outputFilepath);
};

/**
 * Get latest Release Notes
 * @returns {String} - Release notes text
 *
 * @public
 */
let getLatest = () => {
    logger.debug('getReleasenotes');

    let notesList = [];
    let notesVersionsObject = {};
    let notesText;

    // Read from CHANGELOG.json
    try {
        notesVersionsObject = JSON.parse(fs.readFileSync(inputFilepath).toString());
    } catch (err) {
        logger.error(`release notes file read error:`, inputFilepath);
    }

    if (notesVersionsObject.hasOwnProperty(packageJson.version)) {
        notesList = transformToMarkdown(notesVersionsObject[packageJson.version]);
        logger.info('release notes found for:', `v${packageJson.version}`);
    } else {
        notesList = transformToMarkdown(releasenotesTemplate);
        logger.warn('release notes missing for:', `v${packageJson.version}`);
    }

    notesText = json2md(notesList);

    return notesText;
};


/**
 * Main
 */
if (require.main === module) {
    updateFile();
}


/**
 * @exports
 */
module.exports = {
    getLatest: getLatest,
    update: updateFile
};
