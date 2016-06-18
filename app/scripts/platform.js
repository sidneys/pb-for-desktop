'use strict';

/**
 * Based on https://github.com/Aluxian/Facebook-Messenger-Desktop/blob/master/src/components/platform.js
 */
var platform = process.platform;

var type = platform.indexOf('win') === 0 ? 'win'
            : platform.indexOf('darwin') === 0 ? 'darwin'
            : 'linux';

var arch = process.arch === 'ia32' ? '32'
            : '64';

var iconExtension = function(type) {
    return type.indexOf('win') === 0 ? '.ico' : type.indexOf('darwin') === 0 ? '.icns' : '.png';
};

var imageExtension = function(type) {
    return type.indexOf('darwin') === 0 ? '-Template.png' : '.png';
};


module.exports = {
    isDarwin: type === 'darwin',
    isOSX: type === 'darwin',
    isWin: type === 'win',
    isWindows: type === 'win',
    isLinux: type === 'linux',
    name: platform + arch,
    type: platform,
    arch: arch,
    icon: iconExtension,
    image: imageExtension
};
