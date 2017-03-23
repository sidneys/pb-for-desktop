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
 * External
 * @constant
 */
const isReachable = require('is-reachable');

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
const defaultHostname = 'www.google.com';
const defaultInterval = 2000;


/**
 * @instance
 * @global
 */
global.connectivityService = null;

/**
 * Connectivity
 * @extends EventEmitter
 * @class
 */
class Connectivity extends EventEmitter {
    constructor() {
        super();

        this.online = false;
        // -1: did not run, 0: unchanged, 1: changed
        this.didChange = -1;

        this.init();
    }

    /**
     * Start Polling
     */
    init() {
        logger.debug('init');

        setInterval(() => {
            isReachable(defaultHostname).then(online => {
                this.setConnection(online);
            });
        }, defaultInterval);
    }

    /**
     * Sets Connection State
     */
    setConnection(state) {
        if (this.didChange !== -1) {
            if (state !== this.online) {
                this.didChange = 1;
            } else {
                this.didChange = 0;
            }
        }

        this.online = state;

        if (this.didChange !== 0) {
            if (this.online) {
                /** @fires Connectivity#online */
                this.emit('online');
            } else {
                /** @fires Connectivity#offline */
                this.emit('offline');
            }
        }
    }
}


/**
 * Init
 * @function
 */
let init = () => {
    logger.debug('init');

    if (!global.connectivityService) {
        global.connectivityService = new Connectivity();
    }
};

/**
 * Getter
 * @function
 *
 * @public
 */
let getConnectivityService = () => {
    logger.debug('get');

    if (global.connectivityService) {
        return global.connectivityService;
    }
};


init();


/**
 * @exports
 */
module.exports = getConnectivityService();
