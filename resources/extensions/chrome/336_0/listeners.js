'use strict'

pb.addEventListener('signed_in', function(e) {
    pb.addEventListener('active', function(e) {
        if (pb.local.user) {
            pb.trackPerHour({
                'name': 'active'
            })
        }
    })
})

pb.browserState = 'active'

chrome.idle.onStateChanged.addListener(function(newState) {
    pb.log('Chrome state changed to ' + newState)
    pb.browserState = newState

    if (newState == 'locked') {
        pb.fallAsleep()
    }
})

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type == 'loopback') {
        sendResponse({
            'tabId': sender.tab.id
        })
    }
})
