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
 * Singleton
 * @global
 */
global.snoozerService = null;

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
        this.snoozeTimeout = setTimeout(() => {
            logger.debug('snoozer-service', 'setTimeout()', durationHours);

            // End Snooze
            clearTimeout(this.snoozeTimeout);
            global.snoozeUntil = 0;
            menuItem.checked = false;
            notificationService.show(`Woke Up from Snooze (${durationHours} Hours)`);

            this.emit('snooze', false);
        }, (snoozeEnd - Date.now()));
    }

    /**
     * Status
     * @returns {boolean}
     */
    isActive(){
       return global.snoozeUntil !== 0;
    }
}


/**
 * Init
 */
let init = () => {
    logger.debug('snoozer-service', 'init()');

    if (!global.snoozerService) {
        global.snoozerService = new Snoozer();
    }
};

/**
 * Getter
 */
let get = () => {
    logger.debug('snoozer-service', 'get()');

    if (global.snoozerService) {
        return global.snoozerService;
    }
};


init();


/**
 * @exports
 */
module.exports = get();
