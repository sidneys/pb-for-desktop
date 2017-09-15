'use strict';


/**
 * Trim strings and append an ellipsis ('...')
 * @param {String} text - Text to trim
 * @param {Number=} maximumLength - Maximum length (default: 80)
 * @param {String=} ellipsisText - Ellipsis string (default: '...')
 * @returns {String} Trimmed text
 * @private
 */
let ellipsis = (text, maximumLength = 80, ellipsisText = '...') => {
    return (text.length > maximumLength) ? text.substr(0, ((maximumLength / (ellipsisText.length - 1)) + (ellipsisText.length - 1))) + ellipsisText + text.substr(text.length - ((maximumLength / (ellipsisText.length - 1)) + (ellipsisText.length - 1)), text.length) : text;
};


/**
 * @exports
 */
module.exports = ellipsis;

