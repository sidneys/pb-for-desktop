'use strict';


/**
 * Check for Livereload flags
 * @return {Boolean}
 */
let getLivereloadFlag = () => {
    let isLivereload =
        process.env.LIVERELOAD && (process.env.LIVERELOAD > 0) ||
        process.env.npm_lifecycle_event && (process.env.npm_lifecycle_event.includes('livereload') || process.env.npm_lifecycle_event.includes('livereload'));

    return Boolean(isLivereload);
};


/**
 * @exports
 */
module.exports = getLivereloadFlag();
