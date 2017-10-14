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

/**
 * Modules
 * Internal
 * @constant
 */
const appRootPath = require('app-root-path')['path'];
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });


/**
 * @constant
 */
const hidpiSuffix = '@2x';
const templateSuffix = '-Template';


/**
 * Current platform name
 * @type {string}
 */
let getName = process.platform.indexOf('win') === 0 ? 'win' : process.platform.indexOf('darwin') === 0 ? 'darwin' : 'linux';

/**
 * Current Architecture
 * @type {string}
 */
let getArch = process.arch === 'ia32' ? '32' : '64';

/**
 * Get standard image extension for current Platform
 * @param {String} platformName - Platform Name
 * @returns {string}
 */
let getIconImageExtension = (platformName) => {
    return platformName.indexOf('win') === 0 ? '.ico' : platformName.indexOf('darwin') === 0 ? '.icns' : '.png';
};

/**
 * Get standard icon extension for current Platform
 * @param {String} platformName - Platform Name
 * @returns {string}
 */
let getTemplateImageExtension = (platformName) => {
    return platformName.indexOf('darwin') === 0 ? `${templateSuffix}.png` : '.png';
};

/**
 * Get HiDPI / Retina image filename
 * @param {String} imageFilepath - Platform Name
 * @returns {string}
 */
let getHidpiImage = (imageFilepath) => {
    const directory = path.dirname(imageFilepath);
    const extension = path.extname((imageFilepath));
    const name = path.basename(imageFilepath, extension);

    // Ensure "@2x" suffix
    if (!_(name).endsWith(hidpiSuffix)) {
        imageFilepath = path.join(directory, `${name}${hidpiSuffix}${extension}`);
    }

    return imageFilepath;
};

/**
 * Get SVG image filename
 * @param {String} imageFilepath - Platform Name
 * @returns {string}
 */
let getSvgImage = (imageFilepath) => {
    const directory = path.dirname(imageFilepath);
    let extension = path.extname((imageFilepath));
    let name = path.basename(imageFilepath, extension);

    // Remove "@2x" suffix
    name = name.replace(hidpiSuffix, '');

    // Remove "-Template" suffix
    name = name.replace(templateSuffix, '');

    // Ensure ".svg" extension
    extension = '.svg';
    imageFilepath = path.join(directory, `${name}${extension}`);

    return imageFilepath;
};


/**
 * @exports
 */
module.exports = {
    isDarwin: getName === 'darwin',
    isOSX: getName === 'darwin',
    isMacOS: getName === 'darwin',
    isWin: getName === 'win',
    isWindows: getName === 'win',
    isLinux: getName === 'linux',
    name: process.platform + getArch,
    type: process.platform,
    arch: getArch,
    trayImageExtension: '.png',
    menuItemImageExtension: '-Template.png',
    iconImageExtension: getIconImageExtension,
    templateImageExtension: getTemplateImageExtension,
    getHidpiImage: getHidpiImage,
    getSvgImage: getSvgImage
};
