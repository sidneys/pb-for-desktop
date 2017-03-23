'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const chalk = require('chalk');
const chalkline = require('chalkline');
const minimist = require('minimist');
const path = require('path');
const _ = require('lodash');

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
const requiredCount = require(path.join(appRootPath, 'lib', 'required-count'));


/**
 * @return {Boolean}
 * @function
 *
 * @public
 */
let lookupEnvironment = () => {
    let name = _.lowerCase(module.exports.environmentName);

    // Arguments
    let globalArgvObj = {};
    let npmArgvObj = {};
    try { globalArgvObj = minimist(process.argv); } catch (err) {}
    try { npmArgvObj = minimist(JSON.parse(process.env.npm_config_argv).original); } catch (err) {}

    // Node
    const nodeEnvName = process.env['NODE_ENV'];
    const npmScriptName = process.env.hasOwnProperty('npm_lifecycle_event') ? process.env['npm_lifecycle_event'] : false;

    // Global
    const globalValue = process.env[_.lowerCase(name)] || process.env[_.upperCase(name)];

    let isEnv =
        // if DEBUG=1, not if DEBUG=0
        globalValue && _.isFinite(parseInt(globalValue)) && parseInt(globalValue) > 0 ||
        // if DEBUG=text
        globalValue && !_.isFinite(parseInt(globalValue)) && Boolean(globalValue) === true ||
        // if NODE_ENV=environmentName
        nodeEnvName === name ||
        // commandline argument
        globalArgvObj[name] === true ||
        // commandline argument (npm)
        npmArgvObj[name] === true ||
        // npm script name from package.json
        npmScriptName && npmScriptName.includes(`:${name}`);

    return Boolean(isEnv);
};

/**
 * Prints Environment once
 */
let printEnvironmentName = () => {
    let active = lookupEnvironment();
    let count = requiredCount.getCount();
    let name = module.exports.environmentName;
    let style = chalk['white'].bold;

    if (count === 0 && active) {
        chalkline.white();
        console.log(style('ENVIRONMENT:'), style(_.upperCase(name)));
        chalkline.white();
    }
};


let init = () => {

    printEnvironmentName();
};


/**
 * @exports
 */
module.exports = (name) => {
    module.exports.environmentName = name;
    module.exports.environmentActive = lookupEnvironment();

    init();

    return module.exports.environmentActive;
};
