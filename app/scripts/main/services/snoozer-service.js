'use strict'


/**
 * Modules
 * Electron
 * @constant
 */
const { app, ipcMain } = require('electron')

/**
 * Modules
 * External
 * @constant
 */
const logger = require('@sidneys/logger')({ write: true })
const notificationProvider = require('@sidneys/electron-notification-provider')


/**
 * Modules
 * Internal
 * @constant
 */

/**
 * @class SnoozerService
 * @property {Number} snoozeUntil
 * @namespace Electron
 */
class SnoozerService {
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

        this.snoozeUntil = Infinity
        this.onSnooze(true)

        const notification = notificationProvider.create({ title: 'Snooze started', subtitle: `Snoozing indefinitely.` })
        notification.show()
    }

    /**
     * Schedule snooze
     * @param {Number} duration - Snooze duration in minutes
     * @param {Electron.MenuItem} menuItem - Menu item
     *
     * @private
     */
    scheduleSnooze(duration, menuItem) {
        logger.debug('scheduleSnooze')

        if (duration === Infinity) {
            this.infinitySnooze()
            return
        }

        let durationMs = Math.round(duration * (60 * 1000))
        let durationHours = Math.round(duration / 60)

        // Calculate Timestamp
        let snoozeEnd = (Date.now() + durationMs)
        this.snoozeUntil = snoozeEnd

        const notification = notificationProvider.create({
            title: 'Snooze started', subtitle: `Snooze will end in ${durationHours} ${durationHours > 1 ? 'hours' : 'hour'}.`
        })
        notification.show()

        this.onSnooze(true)

        // Schedule to waking up
        let timeout = setTimeout(() => {
            logger.debug('setTimeout', durationHours)

            // End Snooze
            this.snoozeUntil = 0
            menuItem.checked = false

            const notification = notificationProvider.create({
                title: 'Snooze ended', subtitle: `Snooze ended after ${durationHours} ${durationHours > 1 ? 'hours' : 'hour'}.`
            })
            notification.show()

            this.onSnooze(false)

            clearTimeout(timeout)
        }, (snoozeEnd - Date.now()))
    }

    /**
     * Start snooze
     * @param {Number} duration - Snooze duration in minutes
     * @param {Electron.MenuItem} menuItem - Menu item
     *
     * @public
     */
    startSnooze(duration, menuItem) {
        logger.debug('startSnooze')

        let menuItemList = menuItem['menu'].items.filter((item) => item.id && item.id.startsWith('snooze') && item.id !== menuItem['id'])
        let isEnabled = menuItem.checked

        // Disable related menuItems
        menuItemList.forEach(item => item.checked = false)

        // Exit from all Snooze
        if (this.snoozeUntil !== 0) {
            this.snoozeUntil = 0

            const notification = notificationProvider.create({ title: 'Snooze ended', subtitle: 'Snooze mode aborted.' })
            notification.show()

            this.onSnooze(false)
        }

        // Init Snooze
        if ((this.snoozeUntil === 0) && isEnabled) {
            this.scheduleSnooze(duration, menuItem)
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
