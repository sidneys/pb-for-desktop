'use strict'

pb.addEventListener('signed_in', function(e) {
    pb.addEventListener('locals_changed', function(e) {
        pb.updateContextMenu()
    })
})

pb.updateContextMenu = function() {
    chrome.contextMenus.removeAll()

    try {
        if (pb.isSnoozed()) {
            chrome.contextMenus.create({
                'title': chrome.i18n.getMessage('unsnooze'),
                'contexts': ['browser_action'],
                'onclick': function() {
                    pb.unsnooze()
                    pb.updateContextMenu()
                }
            })
        } else {
            chrome.contextMenus.create({
                'title': chrome.i18n.getMessage('snooze'),
                'contexts': ['browser_action'],
                'onclick': function() {
                    pb.snooze()
                    pb.updateContextMenu()
                }
            })
        }
    } catch (e) { }

    if (!pb.settings.showContextMenu || !pb.local.devices) {
        return
    }

    var contexts = ['page', 'link', 'selection', 'image']

    var devices = utils.asArray(pb.local.devices).sort(function(a, b) {
        return b.created - a.created
    })

    devices.unshift({
        'name': chrome.i18n.getMessage('all_of_my_devices')
    })

    devices.forEach(function(target) {
        chrome.contextMenus.create({
            'title': utils.streamDisplayName(target),
            'contexts': contexts,
            'onclick': function(info, tab) {
                contextMenuItemClicked(target, info, tab)
            }
        })
    })

    var chats = utils.asArray(pb.local.chats)
    utils.alphabetizeChats(chats)

    if (devices.length > 0 && chats.length > 0) {
        chrome.contextMenus.create({
            'type': 'separator',
            'contexts': contexts
        })
    }

    chats.forEach(function(target) {
        chrome.contextMenus.create({
            'title': utils.streamDisplayName(target),
            'contexts': contexts,
            'onclick': function(info, tab) {
                contextMenuItemClicked(target, info, tab)
            }
        })
    })

    var contextMenuItemClicked = function(target, info, tab) {
        var push = {}

        if (target.with) {
            push.email = target.with.email
        } else if (target.iden) {
            push.device_iden = target.iden
        }

        if (info.srcUrl) {
            utils.downloadImage(info.srcUrl, function(blob) {
                blob.name =  utils.imageNameFromUrl(info.srcUrl)
                push.file = blob
                pb.sendPush(push)
            })
            return
        } else if (info.linkUrl) {
            push.type = 'link'
            push.title = info.selectionText
            push.url = info.linkUrl
        } else if (info.selectionText) {
            push.type = 'note'
            push.body = info.selectionText
        } else {
            push.type = 'link'
            push.title = tab.title
            push.url = info.pageUrl
        }

        pb.sendPush(push)
    }
}
