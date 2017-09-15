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
const appRootPath = require('app-root-path')['path'];

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });


/**
 * h264ify
 * @namespace video.canPlayType
 * @namespace window.MediaSource
 * @returns {void}
 */
let h264ify = () => {
    logger.debug('h264ify');

    /**
     * Override video.canPlayType
     * @return {String} - Video MIME-Type
     */
    const videoElement = document.createElement('video');
    const defaultCanPlayType = videoElement.canPlayType.bind(videoElement);
    videoElement.__proto__.canPlayType = (type) => {
        // Don't support webm, vp8, vp9
        if (!type) { return ''; }
        if (['webm', 'vp8', 'vp9'].some(typeString => type.indexOf(typeString) >= 0)) { return ''; }

        // Fallback: Browser default
        return defaultCanPlayType(type);
    };

    /**
     * Override window.MediaSource.isTypeSupported
     * @return {String} - Video MIME-Type
     */
    const defaultIsTypeSupported = window.MediaSource.isTypeSupported.bind(window.MediaSource);
    window.MediaSource.isTypeSupported = (type) => {
        // Don't support webm, vp8, vp9
        if (!type) { return ''; }
        if (['webm', 'vp8', 'vp9'].some(typeString => type.indexOf(typeString) >= 0)) { return ''; }

        // Fallback: Browser default
        return defaultIsTypeSupported(type);
    };
};


/**
 * Init
 * @returns {void}
 */
let init = () => {
    logger.debug('init');

    h264ify();
};


/**
 * Run on import
 */
init();

