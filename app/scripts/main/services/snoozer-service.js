'use strict';


/**
 * Modules
 * Node
 * @constant
 */
const EventEmitter = require('events');
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
const notificationService = require(path.join(appRootPath, 'app', 'scripts', 'main', 'services', 'notification-service'));


/**
 * @instance
 * @global
 */
global.snoozerService = null;
global.snoozeUntil = 0;

/**
 * Snoozer
 * @extends EventEmitter
 * @class
 */
class Snoozer extends EventEmitter {
    constructor() {
        super();

        this.init();
    }

    init() {
        logger.debug('init');

        global.snoozeUntil = 0;
    }

    /**
     * Commence snoozing
     * @fires Snoozer:enabled
     * @fires Snoozer:disabled
     */
    snooze(menuItem, duration) {
        logger.debug('snooze');

        let relatedItems = menuItem.menu.items.filter((item) => { return item.id && item.id.startsWith('snooze') && item.id !== menuItem.id; });
        let itemEnabled = menuItem.checked;

        // Reset related menu items
        relatedItems.forEach((item) => {
            item.checked = false;
        });

        // Abort Snooze
        if ((global.snoozeUntil !== 0)) {
            global.snoozeUntil = 0;
            notificationService.show('Aborting Snooze');

            this.emit('snooze', false);
        }

        // Init Snooze
        if ((global.snoozeUntil === 0) && itemEnabled) {
            this.scheduleSnooze(menuItem, duration);
        }
    }

    scheduleSnooze(menuItem, duration) {
        let durationMs = parseInt(duration * (60 * 1000));
        let durationHours = parseInt(duration / 60);

        // Calculate Timestamp
        let snoozeEnd = (Date.now() + durationMs);
        global.snoozeUntil = snoozeEnd;
        notificationService.show(`Entered Snooze (${durationHours} Hours)`);

        this.emit('snooze', true);

        // Schedule to waking up
        let timeout = setTimeout(() => {
            logger.debug('setTimeout', durationHours);

            // End Snooze
            global.snoozeUntil = 0;
            menuItem.checked = false;
            notificationService.show(`Woke Up from Snooze (${durationHours} Hours)`);
            this.emit('snooze', false);

            clearTimeout(timeout);
        }, (snoozeEnd - Date.now()));
    }

    /**
     * Status
     * @returns {boolean}
     */
    isActive() {
        return global.snoozeUntil !== 0;
    }
}


/**
 * Init
 * @function
 */
let init = () => {
    logger.debug('init');

    if (!global.snoozerService) {
        global.snoozerService = new Snoozer();
    }
};

/**
 * Getter
 * @function
 *
 * @public
 */
let getSnoozerService = () => {
    logger.debug('getSnoozerService');

    if (global.snoozerService) {
        return global.snoozerService;
    }
};


init();


/**
 * @exports
 */
module.exports = getSnoozerService();
