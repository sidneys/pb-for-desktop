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
const isOnline = require('is-online');


/**
 * Modules
 * Internal
 * @global
 * @constant
 */
const logger = require(path.join(appRootPath, 'lib', 'logger'))({ writeToFile: true });


/**
 * @global
 */
const defaultHostnameList = ['www.google.com'];
const defaultTimeout = 2000;
const defaultInterval = 5000;



class Connectivity extends EventEmitter {
    constructor() {
        super();

        this.online = false;
        this._startMonitoring();

        this.emit('connection', 'monitoring');
    }

    /**
     * @private
     */
    _startMonitoring() {
        setInterval(() => {
            isOnline({ timeout: defaultTimeout, hostnames: defaultHostnameList }).then(online => {
                this.setConnection(online);
            });
        }, defaultInterval, this);
    }

    setConnection(state) {
        this.online = state;

        if (this.online === true) {
            this.emit('connection', 'online',  state);
        } else {
            this.emit('connection', 'offline',  state);
        }

        if (this.online !== state) {
            this.emit('connection', 'changed',  state);
        }

         // DEBUG
        logger.debug('connection', state);
    }
}

//global.connectivity = new Connectivity();

/**
 * @exports
 */
module.exports= new Connectivity();
