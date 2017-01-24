'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const path = require('path');

/**
 * Modules
 * External
 * @global
 * @constant
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });


/**
 * @global
 * @constant
 */
const defaultInterval = 1000;


/**
 * @global
 */
let pb;


/**
 * Create 'pb-for-desktop' device values
 * @return {{has_sms: boolean, icon: string, manufacturer: string, model: string, nickname: string}}
 */
let createDeviceValues = () => {
    logger.debug('device', 'createDeviceValues()');

    return {
        has_sms: false,
        icon: 'desktop',
        manufacturer: 'pb-for-desktop',
        model: 'pb-for-desktop',
        nickname: 'PB for Desktop'
    };
};

/**
 * Get 'pb-for-desktop' devices
 * @return {Array} Devices with model = 'pb-for-desktop'
 */
let getDevices = () => {
    logger.debug('device', 'getDevices()');

    return pb.api.devices.all.filter((device) => {
        return (device.model === 'pb-for-desktop');
    });
};

/**
 * Get 'pb-for-desktop' devices (active)
 * @return {Array} Devices with model = 'pb-for-desktop'
 */
let getActiveDevices = () => {
    logger.debug('device', 'getActiveDevices()');

    return getDevices().filter((device) => {
        return (device.active === true);
    });
};

/**
 * Get 'pb-for-desktop' devices (inactive)
 * @return {Array} Devices with model = 'pb-for-desktop'
 */
let getInactiveDevices = () => {
    logger.debug('device', 'getInactiveDevices()');

    return getDevices().filter((device) => {
        return (device.active === false);
    });
};

/**
 * Delete 'pb-for-desktop' devices (inactive)
 * @param {Function=} done - callback
 */
let deleteInactiveDevices = function(done) {
    logger.debug('device', 'deleteInactiveDevices()');

    let cb = done || function() {};
    let inactiveDevicesList = getInactiveDevices() || [];

    let devicesProcessed = 0;
    inactiveDevicesList.forEach((device) => {
        pb.api.devices.delete(device);
        devicesProcessed++;
        if (devicesProcessed === inactiveDevicesList.length) {
            return cb();
        }
    });

    cb();
};

/**
 * Delete 'pb-for-desktop' devices (additional)
 * @param {Function=} done - callback
 */
let deleteAdditionalDevices = function(done) {
    logger.debug('device', 'deleteAdditionalDevices()');

    let cb = done || function() {};
    let superflousDevicesList = getActiveDevices().splice(1, getActiveDevices().length) || [];

    let devicesProcessed = 0;
    superflousDevicesList.forEach((device) => {
        pb.api.devices.delete(device);
        devicesProcessed++;
        if (devicesProcessed === superflousDevicesList.length) {
            return cb();
        }
    });

    cb();
};

/**
 * Create 'pb-for-desktop' device
 */
let createDevice = function() {
    logger.debug('device', 'createDevice()');

    pb.api.devices.create(createDeviceValues());
};


/**
 * Init
 */
let initialize = function() {
    logger.debug('device', 'initializeDevice()');

    // Delete inactive devices
    deleteInactiveDevices(function() {
        // Delete superflous devices
        deleteAdditionalDevices(function() {
            let allDevicesList = getDevices();

            // Create device
            if (allDevicesList.length === 0) {
                createDevice();
                window.dispatchEvent(new CustomEvent('devices_ready'));
            }
        });
    });
};


/** @listens window#onload */
window.addEventListener('load', () => {
    logger.debug('device', 'window:load');

    let pollingInterval = setInterval(function() {
        if (!window.pb || !window.pb.account) { return; }

        pb = window.pb;

        initialize();

        clearInterval(pollingInterval);
    }, defaultInterval, this);
});
