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


/**
 * Snoozer
 * @class
 * @extends EventEmitter
 */
class Snoozer extends EventEmitter {
    constructor() {
        super();

        this.init();
    }

    init() {
        logger.debug('snoozer-service', 'init()');

        this.snoozeUntil = 0;
        this.snoozeTimeout = null;
    }

    /**
     * Commence snoozing
     * @fires Snoozer:enabled
     * @fires Snoozer:disabled
     */
    snooze(menuItem, duration) {
        logger.debug('snoozer-service', 'snooze()');

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

            this.emit('disabled');
        }

        // Init Snooze
        if ((global.snoozeUntil === 0) && itemEnabled) {
            // Calculate Timestamp
            let snoozeEnd = (Date.now() + durationMs);
            global.snoozeUntil = snoozeEnd;
            notificationService.show(`Entered Snooze (${durationHours} Hours)`);

            this.emit('enabled');

            // Schedule to waking up
            this.snoozeTimeout = setTimeout(function() {
                // End Snooze
                clearTimeout(this.snoozeTimeout);
                global.snoozeUntil = 0;
                this.menuItem.checked = false;
                notificationService.show(`Waking Up from Snooze (${durationHours} Hours)`);

                this.emit('disabled');
            }, (snoozeEnd - Date.now()));
        }
    }
}


/**
 * @exports
 */
module.exports = new Snoozer();
