'use strict';


/**
 * Modules
 * Node
 * @global
 * @constant
 */
const EventEmitter = require('events');
const path = require('path');

/**
 * Modules
 * Electron
 * @global
 * @constant
 */
const { app, BrowserWindow, dialog, Menu, Tray } = require('electron');

/**
 * Modules
 * External
 * @global
 * @const
 */
const appRootPath = require('app-root-path').path;

/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });
const notificationService = require(path.join(appRootPath, 'app', 'scripts', 'services', 'notification-service'));



/**
 * @global
 */
global.snoozeUntil = 0;



class Snooze extends EventEmitter {
    constructor() {
        super();

        this.snoozeUntil = 0;
        this.snoozeTimeout = null;
    }

    snooze(menuItem, duration) {

        let relatedItems = menuItem.menu.items.filter((item) => { return item.id && item.id.startsWith('snooze') && item.id !== menuItem.id; });
        let itemEnabled = menuItem.checked;
        let durationMs = parseInt(duration * (60 * 1000));
        let durationHours = parseInt(duration / 60);

        // Reset related menu items
        relatedItems.forEach((item) => {
            item.checked = false;
        });

        // Clear Timer
        clearTimeout(this.snoozeTimeout);

        // Abort Snooze
        if ((global.snoozeUntil !== 0)) {
            global.snoozeUntil = 0;
            notificationService.show('Aborting Snooze');

            this.emit('snooze', 'disabled');
        }

        // Init Snooze
        if ((global.snoozeUntil === 0) && itemEnabled) {
            // Calculate Timestamp
            let snoozeEnd = (Date.now() + durationMs);
            global.snoozeUntil = snoozeEnd;
            notificationService.show(`Entered Snooze (${durationHours} Hours)`);

            this.emit('snooze', 'enabled');

            // Schedule to waking up
            this.snoozeTimeout = setTimeout(function() {
                // End Snooze
                clearTimeout(this.snoozeTimeout);
                global.snoozeUntil = 0;
                this.menuItem.checked = false;
                notificationService.show(`Waking Up from Snooze (${durationHours} Hours)`);

                this.emit('snooze', 'disabled');
            }, (snoozeEnd - Date.now()));
        }

        // DEBUG
        logger.debug('snooze-service', 'snooze');
    }
}


/**
 * @exports
 */
module.exports = new Snooze();
