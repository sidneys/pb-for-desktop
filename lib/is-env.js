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
const tryRequire = require('try-require');


/**
 * Modules
 * Internal
 * @constant
 */
const requiredCount = require(path.join(appRootPath, 'lib', 'required-count'));

/** @namespace remote.process */

/**
 * @return {Boolean}
 * @function
 *
 * @public
 */
let lookupEnvironment = () => {
    let name = _.lowerCase(module.exports.environmentName);

    // Lookup global CLI arguments
    let globalArgvObj = {};
    try { globalArgvObj = minimist(process.argv); } catch (err) {}

    // Lookup "npm run script" arguments
    let npmArgvObj = {};
    try { npmArgvObj = minimist(JSON.parse(process.env.npm_config_argv).original); } catch (err) {}

    // Lookup Electron arguments
    let electronArgvObj = {};
    const { remote } = tryRequire('electron');
    if (remote && remote.process) {
        try { electronArgvObj = minimist(remote.process.argv); } catch (err) {}
    }

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
        // global CLI arguments
        globalArgvObj[name] === true ||
        // "npm run script" arguments
        npmArgvObj[name] === true ||
        // Electron arguments
        electronArgvObj[name] === true ||
        // npm script name from package.json
        npmScriptName && npmScriptName.includes(`:${name}`);

    return Boolean(isEnv);
};

/** @namespace chalkline.white */

/**
 * Prints Environment once
 */
let printEnvironmentName = () => {
    const active = lookupEnvironment();
    const count = requiredCount.getCount();
    const name = module.exports.environmentName;
    const style = chalk['white'].bold;
    const title = 'environment';

    if (count === 0 && active) {
        if (process.type === 'renderer') {
            // Chrome Developer Console
            console.log(
                `%c${title}: ${name}`,
                'padding: 0.5rem 50% 0.5rem 0.5rem; white-space: nowrap; background-color: rgb(100, 100, 100); color: white; text-transform: uppercase; font-weight: bold; line-height: 2rem;'
            );
        } else {
            // Terminal
            chalkline.white();
            console.log(
                style('ENVIRONMENT:'),
                style(_.upperCase(name))
            );
            chalkline.white();
        }
    }
};


let init = () => {

    printEnvironmentName();
};


/**
 * @exports
 * @param {String} name - Environment name
 * @return {Boolean} Environment status
 */
module.exports = (name) => {
    module.exports.environmentName = name;
    module.exports.environmentActive = lookupEnvironment();

    init();

    return module.exports.environmentActive;
};
