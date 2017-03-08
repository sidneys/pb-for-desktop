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
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ write: true });


/**
 * @constant
 * @default
 */
const defaultInterval = 2000;


/**
 * @instance
 */
let pb;


/**
 * Create 'pb-for-desktop' device values
 * @return {{has_sms: boolean, icon: string, manufacturer: string, model: string, nickname: string}}
 */
let createDeviceValues = () => {
    logger.debug('createDeviceValues');

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
    logger.debug('getDevices');

    return pb.api.devices.all.filter((device) => {
        return (device.model === 'pb-for-desktop');
    });
};

/**
 * Get 'pb-for-desktop' devices (active)
 * @return {Array} Devices with model = 'pb-for-desktop'
 */
let getActiveDevices = () => {
    logger.debug('getActiveDevices');

    return getDevices().filter((device) => {
        return (device.active === true);
    });
};

/**
 * Get 'pb-for-desktop' devices (inactive)
 * @return {Array} Devices with model = 'pb-for-desktop'
 */
let getInactiveDevices = () => {
    logger.debug('getInactiveDevices');

    return getDevices().filter((device) => {
        return (device.active === false);
    });
};

/**
 * Delete 'pb-for-desktop' devices (inactive)
 * @param {Function=} callback - callback
 */
let deleteInactiveDevices = function(callback) {
    logger.debug('deleteInactiveDevices');

    let cb = callback || function() {};
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
 * @param {Function=} callback - callback
 */
let deleteAdditionalDevices = function(callback) {
    logger.debug('deleteAdditionalDevices');

    let cb = callback || function() {};
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
let createDevice = () => {
    logger.debug('createDevice');

    pb.api.devices.create(createDeviceValues());
};


/**
 * Init
 */
let initialize = () => {
    logger.debug('initializeDevice');

    // Delete inactive devices
    deleteInactiveDevices(() => {
        // Delete superflous devices
        deleteAdditionalDevices(() => {
            let allDevicesList = getDevices();

            // Create device
            if (allDevicesList.length === 0) {
                createDevice();
                window.dispatchEvent(new CustomEvent('devices_ready'));
            }
        });
    });
};


/**
 * @listens window#load
 */
window.addEventListener('load', () => {
    logger.debug('window#load');

    let interval = setInterval(() => {
        if (!window.pb || !window.pb.account) { return; }

        pb = window.pb;

        initialize();

        clearInterval(interval);
    }, defaultInterval, this);
});
