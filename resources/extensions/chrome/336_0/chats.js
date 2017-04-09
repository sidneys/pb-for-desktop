'use strict'

var activeChats = {}

pb.addEventListener('signed_in', function() {
    activeChats = {}
})

pb.setActiveChat = function(tabId, info) {
    pb.log('Opened/updated chat ' + tabId + ', other=' + info.other + ', focused=' + info.focused)

    activeChats[tabId] = info

    if (info.mode == 'sms' && info.focused) {
        Object.keys(pb.notifier.active).forEach(function(key) {
            if (key.indexOf('sms') != -1) {
                pb.notifier.dismiss(key)
            }
        })
    }
}

pb.clearActiveChat = function(tabId) {
    if (activeChats[tabId]) {
        pb.log('Closed chat ' + tabId)
    }
    delete activeChats[tabId]
}

pb.openChat = function(mode, other) {
    var found = false
    Object.keys(activeChats).forEach(function(tabId) {
        var info = activeChats[tabId]
        if (!info) {
            return
        } else if (info.other != other) {
            return
        } else if (tabId == 'panel') {
            return
        }

        found = true

        focusChat(tabId)
    })

    if (!found) {
        openChat(mode, other)
    }
}

var openChat = function(mode, other) {
    var spec = {
        'url': chrome.extension.getURL('chat-window.html') + '?guid=' + utils.guid() + '&mode=' + mode + '#' + other,
        'width': 320,
        'height': 420
    }

    spec.type = 'popup'

    chrome.windows.create(spec, function(created) {
        chrome.windows.update(created.id, { 'focused': true })
    })

    pb.track({
        'name': 'chat_window_opened',
        'mode': mode
    })
}

var focusChat = function(tabId) {
    chrome.tabs.get(parseInt(tabId), function(tab) {
        chrome.windows.update(tab.windowId, { 'focused': true })
    })
}

pb.findChat = function(other) {
    var chatTabInfo
    Object.keys(activeChats).forEach(function(tabId) {
        var info = activeChats[tabId]
        if (info.other == other) {
            if (chatTabInfo && chatTabInfo.focused && !info.focused) {
                // We've already found a focused chat, don't clobber with this not-focused one
                return
            }

            chatTabInfo = info
        }
    })

    return chatTabInfo
}
