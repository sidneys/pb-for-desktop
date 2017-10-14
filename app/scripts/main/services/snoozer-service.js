'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const path = require('path');

/**
 * Modules
 * Electron
 * @constant
 */
const { app, ipcMain } = require('electron');

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
const notificationProvider = require(path.join(appRootPath, 'app', 'scripts', 'main', 'providers', 'notification-provider'));


/**
 * @class SnoozerService
 * @property {Number} snoozeUntil
 * @namespace Electron
 */
class SnoozerService {
    constructor() {
        this.snoozeUntil = 0;
    }

    /**
     * @param {Boolean} snoozing - Snooze state
     * @fires Snoozer#EventEmitter:snooze
     * @private
     */
    onSnooze(snoozing) {
        logger.debug('onSnooze');

        ipcMain.emit('snooze', snoozing);
    }

    /**
     * Schedule snooze
     * @param {Electron.MenuItem} menuItem - Menu item
     * @param {Number} duration - Snooze duration in minutes
     * @private
     */
    scheduleSnooze(menuItem, duration) {
        let durationMs = parseInt(duration * (60 * 1000));
        let durationHours = parseInt(duration / 60);

        // Calculate Timestamp
        let snoozeEnd = (Date.now() + durationMs);
        this.snoozeUntil = snoozeEnd;

        const notification = notificationProvider.create({ title: 'Snooze started', subtitle: `Snooze mode will end in ${durationHours} ${durationHours > 1 ? 'hours' : 'hour'}.` });
        notification.show();

        this.onSnooze(true);

        // Schedule to waking up
        let timeout = setTimeout(() => {
            logger.debug('setTimeout', durationHours);

            // End Snooze
            this.snoozeUntil = 0;
            menuItem.checked = false;

            const notification = notificationProvider.create({ title: 'Snooze ended', subtitle: `Snooze mode ended after ${durationHours} ${durationHours > 1 ? 'hours' : 'hour'}.` });
            notification.show();

            this.onSnooze(false);

            clearTimeout(timeout);
        }, (snoozeEnd - Date.now()));
    }

    /**
     * Start snooze
     * @param {Electron.MenuItem} menuItem - Menu item
     * @param {Number} duration - Snooze duration in minutes
     * @public
     */
    snooze(menuItem, duration) {
        logger.debug('snooze');

        let relatedItems = menuItem['menu'].items.filter((item) => item.id && item.id.startsWith('snooze') && item.id !== menuItem['id']);
        let itemEnabled = menuItem.checked;

        // Reset related menu items
        relatedItems.forEach((item) => {
            item.checked = false;
        });

        // Abort Snooze
        if (this.snoozeUntil !== 0) {
            this.snoozeUntil = 0;

            const notification = notificationProvider.create({ title: 'Snooze ended', subtitle: 'Snooze mode aborted.' });
            notification.show();

            this.onSnooze(false);
        }

        // Init Snooze
        if ((this.snoozeUntil === 0) && itemEnabled) {
            this.scheduleSnooze(menuItem, duration);
        }
    }

    /**
     * Status
     * @returns {Boolean}
     * @public
     */
    isActive() {
        return this.snoozeUntil !== 0;
    }
}


/**
 * Init
 */
let init = () => {
    logger.debug('init');

    // Ensure single instance
    if (!global.snoozerService) {
        global.snoozerService = new SnoozerService();
    }
};

/**
 * @listens Electron.App#Event:ready
 */
app.once('ready', () => {
    logger.debug('app#ready');

    init();
});


/**
 * @exports
 */
module.exports = global.snoozerService;
