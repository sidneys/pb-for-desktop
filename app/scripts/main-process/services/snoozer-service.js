'use strict'


/**
 * Modules (Electron)
 * @constant
 */
const { app, ipcMain } = require('electron')

/**
 * Modules (Third party)
 * @constant
 */
const logger = require('@sidneys/logger')({ write: true })
const notificationProvider = require('@sidneys/electron-notification-provider')


/**
 * Modules (Local)
 * @constant
 */

/**
 * @class SnoozerService
 * @property {Number} snoozeUntil
 * @namespace Electron
 */
class SnoozerService {
    /**
     * @constructor
     */
    constructor() {
        this.snoozeUntil = 0
    }

    /**
     * @param {Boolean} isSnoozing - Snooze state
     * @fires Snoozer#EventEmitter:snooze
     *
     * @private
     */
    onSnooze(isSnoozing) {
        logger.debug('onSnooze')

        ipcMain.emit('snooze', isSnoozing)
    }

    /**
     * Snooze until indefinitely
     *
     * @private
     */
    infinitySnooze() {
        logger.debug('infinitySnooze')

        // Set timestamp
        this.snoozeUntil = Infinity

        // Emit
        this.onSnooze(true)

        // Notification
        const notification = notificationProvider.create({
            title: 'Snooze started',
            subtitle: 'Snoozing indefinitely.'
        })
        notification.show()
    }

    /**
     * Schedule snooze
     * @param {Number} durationMinutes - Snooze duration
     * @param {Electron.MenuItem} menuItem - Menu item
     *
     * @private
     */
    scheduleSnooze(durationMinutes, menuItem) {
        logger.debug('scheduleSnooze')

        if (durationMinutes === Infinity) {
            this.infinitySnooze()

            return
        }

        const durationMilliseconds = Math.round(durationMinutes * (60 * 1000))

        // Set timestamp
        this.snoozeUntil = Date.now() + durationMilliseconds
        const snoozeRemaining = this.snoozeUntil - Date.now()

        // Notification
        const notification = notificationProvider.create({
            title: 'Snooze started',
            subtitle: `Snooze ends in ${durationMinutes} minutes.`
        })
        notification.show()

        // Emit
        this.onSnooze(true)

        // Schedule wake up
        let timeout = setTimeout(() => {
            logger.debug('setTimeout()', 'durationMinutes:', durationMinutes)

            // Set timestamp
            this.snoozeUntil = 0

            // Uncheck menuItem
            menuItem.checked = false

            // Notification
            const notification = notificationProvider.create({
                title: 'Snooze ended',
                subtitle: `Snooze ended after ${durationMinutes} minutes.`
            })
            notification.show()

            // Emit
            this.onSnooze(false)

            clearTimeout(timeout)
        }, snoozeRemaining)
    }

    /**
     * Start snooze
     * @param {Number} durationMinutes - Snooze duration
     * @param {Electron.MenuItem} menuItem - Menu item
     *
     * @public
     */
    startSnooze(durationMinutes, menuItem) {
        logger.debug('startSnooze')

        // Get menuItem state
        let isEnabled = menuItem.checked

        // Get sibling menuItems
        let siblingMenuItemList = menuItem['menu'].items.filter((item) => item.id && item.id.startsWith('snooze') && item.id !== menuItem['id'])

        // Uncheck sibling menuItems
        siblingMenuItemList.forEach(item => item.checked = false)

        // Cancel existing Snooze
        if (this.snoozeUntil !== 0) {
            this.snoozeUntil = 0

            // Notification
            const notification = notificationProvider.create({
                title: 'Snooze ended',
                subtitle: 'Snooze aborted.'
            })
            notification.show()

            // Emit
            this.onSnooze(false)
        }

        // Init Snooze
        if ((this.snoozeUntil === 0) && isEnabled) {
            this.scheduleSnooze(durationMinutes, menuItem)
        }
    }
}


/**
 * Init
 */
let init = () => {
    logger.debug('init')

    // Ensure single instance
    if (!global.snoozerService) {
        global.snoozerService = new SnoozerService()
    }
}

/**
 * @listens Electron.App#Event:ready
 */
app.once('ready', () => {
    logger.debug('app#ready')

    init()
})


/**
 * @exports
 */
module.exports = global.snoozerService
