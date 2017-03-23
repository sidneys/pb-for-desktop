'use strict';


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
    return platformName.indexOf('darwin') === 0 ? '-Template.png' : '.png';
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
    templateImageExtension: getTemplateImageExtension
};
