'use strict';


let type = process.platform.indexOf('win') === 0 ? 'win'
            : process.platform.indexOf('darwin') === 0 ? 'darwin'
            : 'linux';

let arch = process.arch === 'ia32' ? '32'
            : '64';

let iconExtension = function(type) {
    return type.indexOf('win') === 0 ? '.ico' : type.indexOf('darwin') === 0 ? '.icns' : '.png';
};


let imageExtension = function(type) {
    return type.indexOf('darwin') === 0 ? '-Template.png' : '.png';
};


module.exports = {
    isDarwin: type === 'darwin',
    isOSX: type === 'darwin',
    isWin: type === 'win',
    isWindows: type === 'win',
    isLinux: type === 'linux',
    name: process.platform + arch,
    type: process.platform,
    arch: arch,
    iconExtension: iconExtension,
    imageExtension: imageExtension
};
