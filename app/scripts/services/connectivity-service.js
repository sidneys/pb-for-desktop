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
 * Modules
 * External
 * @global
 * @constant
 */
const isOnline = require('is-online');


/**
 * @global
 * @constant
 */
const defaultHostnameList = ['www.google.com'];
const defaultTimeout = 2000;
const defaultInterval = 5000;


/**
 * Singleton
 * @global
 */
let connectivity;

/**
 * Connectivity Monitor
 * @class
 * @extends EventEmitter
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
        logger.debug('connectivity-service', 'init()');

        setInterval(() => {
            isOnline({ timeout: defaultTimeout, hostnames: defaultHostnameList }).then(online => {
                this.setConnection(online);
            });
        }, defaultInterval, this);
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
 * Initializer
 */
let init = () => {
    logger.debug('connectivity-service', 'create()');

    connectivity = new Connectivity();
};

/**
 * Getter
 */
let get = () => {
    logger.debug('connectivity-service', 'get()');

    if (!connectivity) { return; }
    return connectivity;
};


init();


/**
 * @exports
 */
module.exports = get();
