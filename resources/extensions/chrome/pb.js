'use strict'

var pb = {
    'www': 'https://www.pushbullet.com',
    'api': 'https://api.pushbullet.com',
    'websocket': 'wss://stream.pushbullet.com/websocket',
    'streaming': 'https://stream.pushbullet.com/streaming',
    'andrelytics': 'https://zebra.pushbullet.com'
}

pb.version = parseInt(chrome.runtime.getManifest().version)

if (navigator.userAgent.indexOf('OPR') >= 0) {
    pb.browser = 'opera'
    pb.browserVersion = parseInt(navigator.appVersion.match(/Chrome\/(\d+)\./)[1], 10)
    pb.userAgent = 'Pushbullet Opera ' + pb.version
} else if (navigator.userAgent.indexOf('Firefox') >= 0) {
    pb.browser = 'firefox'
    pb.browserVersion = parseInt(navigator.userAgent.match(/Firefox\/(\d+)\./)[1])
    pb.userAgent = 'Pushbullet Firefox ' + pb.version
} else {
    pb.browser = 'chrome'
    pb.browserVersion = parseInt(navigator.appVersion.match(/Chrome\/(\d+)\./)[1], 10)
    pb.userAgent = 'Pushbullet Chrome '  + pb.version
}

// ---------------------------------------------------------------------------------------------------

pb.rollingLog = []
pb.log = function(message) {
    try {
        var line
        if (message instanceof Object || message instanceof Array) {
            line = message
        } else {
            line = new Date().toLocaleString() + ' - ' + message
        }

        console.log(line)
        pb.rollingLog.push(JSON.stringify(line))

        if (pb.rollingLog.length > 400) {
            pb.rollingLog.shift()
        }
    } catch (e) {
        console.error(e)
    }
}

// ---------------------------------------------------------------------------------------------------

pb.eventListeners = []

pb.addEventListener = function(eventName, listener) {
    pb.eventListeners.push({ 'eventName': eventName, 'listener': listener })
    window.addEventListener(eventName, listener, false)
}

pb.removeEventListener = function(eventName, listener) {
    var eventListeners = []

    pb.eventListeners.forEach(function(eventListener) {
        if (eventListener.eventName == eventName && eventListener.listener == listener) {
            window.removeEventListener(eventName, listener)
        } else {
            eventListeners.push(eventListener)
        }
    })

    pb.eventListeners = eventListeners
}

pb.clearEventListeners = function() {
    var eventListeners = []
    var dontRemove = ['signed_in', 'signed_out']

    pb.eventListeners.forEach(function(eventListener) {
        if (dontRemove.indexOf(eventListener.eventName) == -1) {
            window.removeEventListener(eventListener.eventName, eventListener.listener, false)
        } else {
            eventListeners.push(eventListener)
        }
    })

    pb.eventListeners = eventListeners
}

pb.dispatchEvent = function(eventName, details) {
    window.dispatchEvent(new CustomEvent(eventName, { 'detail': details }))
}

// ---------------------------------------------------------------------------------------------------

pb.popOutPanel = function() {
    pb.log('Popping out panel')

    pb.track({
        'name': 'panel_popped_out'
    })
  
    var popoutUrl = chrome.extension.getURL('panel.html')

    chrome.tabs.query({ url: popoutUrl }, function(tabs) {
        if (tabs.length > 0) {
            chrome.windows.update(tabs[0].windowId, { 'focused': true }, function() {
                chrome.tabs.update(tabs[0].id, { 'active': true })
            })
        } else {
            chrome.windows.create({
                'url': popoutUrl + '#popout',
                'type': 'popup',
                'width': 640,
                'height': 456
            })
        }
    })
}

pb.openTab = function(url) {
    chrome.windows.getCurrent({ 'populate': false }, function(current) {
        if (current) {
            chrome.tabs.create({ 'url': url, 'active': true }, function(tab) {
                chrome.windows.update(tab.windowId, { 'focused': true })
            })
        } else {
            chrome.windows.create({ 'url': url, 'type': 'normal' })
        }
    })
}

pb.signOut = function() {
    pb.fallAsleep()

    pb.track({
        'name': 'signed_out'
    })

    localStorage.clear()

    localStorage.hasShownSignInNotification = true

    pb.saveSettings()

    chrome.cookies.remove({ 'url': 'https://www.pushbullet.com', 'name': 'api_key' })

    pb.dispatchEvent('signed_out')

    pb.clearEventListeners()

    clearTimeout(pb.snoozeTimeout)
}
