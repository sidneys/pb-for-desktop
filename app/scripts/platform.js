'use strict';

/**
 * Based on https://github.com/Aluxian/Facebook-Messenger-Desktop/blob/master/src/components/platform.js
 */
var platform = process.platform;

platform = platform.indexOf('win') === 0 ? 'win'
            : platform.indexOf('darwin') === 0 ? 'darwin'
            : 'linux';

var arch = process.arch === 'ia32' ? '32' : '64';

var icon = function(type) {
    return type.indexOf('win') === 0 ? '.ico' : type.indexOf('darwin') === 0 ? '.icns' : '.png';
};

var image = function(type) {
    return type.indexOf('darwin') === 0 ? '-Template.png' : '.png';
};


module.exports = {
    isDarwin: platform === 'darwin',
    isOSX: platform === 'darwin',
    isWind: platform === 'win',
    isWindows: platform === 'win',
    isLinux: platform === 'linux',
    name: platform + arch,
    type: platform,
    arch: arch,
    icon: icon,
    image: image
};
