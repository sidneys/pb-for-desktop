'use strict'

var pendingMirrors = {}

pb.addEventListener('signed_in', function(e) {
    pb.addEventListener('stream_message', function(e) {
        var message = e.detail
        if (message.type != 'push' || !message.push) {
            return
        }

        var push = message.push
        if (push.source_device_iden && pb.local.device && push.source_device_iden == pb.local.device.iden) {
            return
        } else if (push.target_device_iden && pb.local.device && push.target_device_iden != pb.local.device.iden) {
            return
        }

        if (push.type == 'mirror') {
            mirrorReceived(push)
        } else if (push.type == 'dismissal') {
            dismissalReceived(push)
        }
    })
})

var mirrorReceived = function(mirror) {
    if (pb.browserState == 'locked') {
        pb.log('Computer locked, not showing mirror')
        return
    }

    showMirror(mirror)
}

var showMirror = function(mirror) {
    if (!mirror) {
        return
    }

    pb.log('Mirroring notification for:')
    pb.log(mirror)

    var options = { }
    options.type = 'basic'
    options.key = notificationKey(mirror)
    options.iconUrl = 'data:image/jpeg;base64,' + mirror.icon
    options.title = mirror.application_name + ': ' + (mirror.title || '')
    options.message = mirror.body || ''
    options.buttons = []

    var sourceDevice = pb.local.devices[mirror.source_device_iden]
    if (sourceDevice) {
        try {
            options.contextMessage = chrome.i18n.getMessage('mirror_context_message', [sourceDevice.nickname || sourceDevice.model, new Date().toLocaleTimeString().replace(/:\d+ /, ' ')])
        } catch (e) {
            options.contextMessage = sourceDevice.nickname || sourceDevice.model
        }
    }

    options.onclick = function() {
        var url = getWebUrl(mirror)
        if (url) {
            if (url.slice(-1) == '/') {
                var info = {
                    'url': url + '*'
                }

                chrome.tabs.query(info, function(results) {
                    if (results.length > 0) {
                        var tab = results[0]
                        chrome.windows.update(tab.windowId, { 'focused': true }, function() {
                            chrome.tabs.update(tab.id, { 'active': true }, function() {
                            })
                        })
                    } else {
                        pb.openTab(url)
                    }
                })
            } else {
                pb.openTab(url)
            }
        } else {
            if (mirror.conversation_iden) {
                openQuickReply(mirror)
            } else if (url) {
                pb.openTab(url)
            }
        }

        dismissRemote(mirror)
    }

    if (!mirror.conversation_iden && mirror.package_name != 'com.pushbullet.android') {
        options.buttons.push(muteButton(mirror))
    }

    if (mirror.actions && mirror.package_name != 'com.google.android.talk') {
        mirror.actions.forEach(function(action) {
            options.buttons.push({
                'title': 'Android: ' + action.label,
                'short_title': action.label,
                'iconUrl': 'action_android.png',
                'onclick': function() {
                    if (pb.local.user.pro) {
                        dismissRemote(mirror, action.trigger_key)
                    } else {
                        pb.openTab('https://help.pushbullet.com/articles/notification-actions-require-pushbullet-pro/')
                        showMirror(mirror)
                        pb.track({
                            'name': 'go_upgrade',
                            'source': 'notification_action'
                        })
                    }
                }
            })
        })
    }

    if (mirror.conversation_iden || mirror.package_name == 'com.google.android.talk') {
        options.buttons.push({
            'title': chrome.i18n.getMessage('reply'),
            'iconUrl': 'action_reply.png',
            'onclick': function() {
                if (mirror.conversation_iden) {
                    openQuickReply(mirror)
                } else if (mirror.package_name == 'com.google.android.talk') {
                    pb.openTab('https://help.pushbullet.com/articles/why-cant-i-reply-to-hangouts-messages/')
                }

                dismissRemote(mirror)
            }
        })
    }

    options.buttons.push({
        'title': chrome.i18n.getMessage('dismiss'),
        'iconUrl': 'action_cancel.png',
        'onclick': function() {
            dismissRemote(mirror)
        }
    })

    getAndroidClickMapping()

    pendingMirrors[options.key] = options
    utils.checkNativeClient(function(response) {
        if (!response && pendingMirrors[options.key]) {
            pb.notifier.show(options)
        }

        delete pendingMirrors[options.key]
    })
}

var muteButton = function(mirror) {
    var mute = function() {
        var data = {
            'type': 'mute',
            'source_user_iden': mirror.source_user_iden,
            'package_name': mirror.package_name
        }

        var push
        if (pb.e2e.enabled) {
            push = {
                'encrypted' : true,
                'ciphertext': pb.e2e.encrypt(JSON.stringify(data))
            }
        } else {
            push = data
        }

        pb.post(pb.api + '/v2/ephemerals', {
            'type': 'push',
            'push': push
        }, function(response) {
            if (response) {
                pb.log('Muted ' + mirror.package_name)
                showUndo()
            } else {
                pb.log('Failed to mute ' + mirror.package_name)
            }
        })
    }

    var showUndo = function() {
        var undo = {
            'type': 'basic',
            'key': notificationKey(mirror),
            'title': chrome.i18n.getMessage('muted_app', [mirror.application_name]),
            'message': '',
            'iconUrl': 'data:image/jpeg;base64,' + mirror.icon,
            'priority': 0
        }

        undo.buttons = [{
            'title': chrome.i18n.getMessage('unmute_app', [mirror.application_name]),
            'iconUrl': 'action_undo.png',
            'onclick': function() {
                var data = {
                    'type': 'unmute',
                    'source_user_iden': mirror.source_user_iden,
                    'package_name': mirror.package_name
                }

                var push
                if (pb.e2e.enabled) {
                    push = {
                        'encrypted' : true,
                        'ciphertext': pb.e2e.encrypt(JSON.stringify(data))
                    }
                } else {
                    push = data
                }

                pb.post(pb.api + '/v2/ephemerals', {
                    'type': 'push',
                    'push': push
                }, function(response) {
                    if (response) {
                        pb.log('Unmuted ' + mirror.package_name)
                    } else {
                        pb.log('Failed to unmute ' + mirror.package_name)
                    }
                })
            }
        }]

        undo.buttons.push({
            'title': chrome.i18n.getMessage('done'),
            'iconUrl': 'action_tick.png',
            'onclick': function() {
            }
        })

        pb.notifier.show(undo)
    }

    return {
        'title': chrome.i18n.getMessage('mute_app', [mirror.application_name]),
        'short_title': chrome.i18n.getMessage('mute'),
        'iconUrl': 'action_halt.png',
        'onclick': function() {
            mute()
        }
    }
}

var dismissRemote = function(mirror, triggerKey) {
    var data = {
        'type': 'dismissal',
        'source_user_iden': mirror.source_user_iden,
        'package_name': mirror.package_name,
        'notification_id': mirror.notification_id,
        'notification_tag': mirror.notification_tag
    }

    if (mirror.conversation_iden) {
        data.conversation_iden = mirror.conversation_iden
    }

    if (triggerKey) {
        data.trigger_action = triggerKey
    }

    var push
    if (pb.e2e.enabled) {
        push = {
            'encrypted' : true,
            'ciphertext': pb.e2e.encrypt(JSON.stringify(data))
        }
    } else {
        push = data
    }

    pb.post(pb.api + '/v2/ephemerals', {
        'type': 'push',
        'push': push
    }, function(response) {
        if (response) {
            pb.log('Triggered remote dismissal of ' + notificationKey(mirror))
        } else {
            pb.log('Failed to trigger remote dismissal of ' + notificationKey(mirror))
        }
    })
}

var dismissalReceived = function(dismissal) {
    if (!dismissal) {
        return
    }

    var dismissalKey = notificationKey(dismissal)

    Object.keys(pb.notifier.active).forEach(function(key) {
        if (key.indexOf(dismissalKey) != -1) {
            pb.notifier.dismiss(key)
        }
    })

    delete pendingMirrors[dismissalKey]
}

var notificationKey = function(push) {
    var key
    if (push.package_name == 'sms') {
        key = 'sms'
    } else {
        key = push.package_name + '_' + (push.notification_tag || null) + '_' + push.notification_id
        if (push.conversation_iden) {
            key += '_' + push.conversation_iden
        }
    }
    return key
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
// Smart clicks on Android mirrored notifications
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

var androidClickMapping
var getAndroidClickMapping = function() {
    if (androidClickMapping) {
        return
    }

    pb.log('Getting Android package name to url mapping')

    androidClickMapping = { }

    var xhr = new XMLHttpRequest()
    xhr.open('GET', 'https://update.pushbullet.com/android_mapping.json', true)
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            try {
                androidClickMapping = JSON.parse(xhr.responseText)
            } catch (e) {
                androidClickMapping = null
            }
        }
    }
    xhr.send()
}

var getWebUrl = function(mirror) {
    if (mirror.click_url && mirror.click_url.indexOf('http') == 0) {
        return mirror.click_url
    } else if (mirror.package_name == 'com.google.android.gm' && mirror.body) {
        var parts = mirror.body.split('\n')
        if (parts > 1) {
            return 'https://mail.google.com/mail/u/?authuser=' + parts[0]
        }
    }

    if (androidClickMapping) {
        return androidClickMapping[mirror.package_name]
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
// Power the Quick-Reply popup
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

var openQuickReply = function(mirror) {
    pb.log('Opening quick-reply for ' + notificationKey(mirror))

    var spec = {
        'url': 'quick-reply.html',
        'width': 320,
        'height': 370
    }

    var lastScreenX = localStorage['quickReplyScreenX']
    var lastScreenY = localStorage['quickReplyScreenY']
    if (lastScreenX && lastScreenY) {
        spec.top = parseInt(lastScreenY)
        spec.left = parseInt(lastScreenX)
    } else {
        spec.top = Math.floor((screen.availHeight / 2) - (spec.height / 2)) - 100,
        spec.left = Math.floor((screen.availWidth / 2) - (spec.width / 2)) + 100
    }

    spec.type = 'popup'

    var listener = function(message, sender, sendResponse) {
        if (message.type == 'quickreply_get_mirror') {
            sendResponse(mirror)
            chrome.runtime.onMessage.removeListener(listener)
        }
    }

    chrome.runtime.onMessage.addListener(listener)

    chrome.windows.create(spec, function(w) {
        chrome.windows.update(w.id, { 'focused': true })
    })
}

pb.sendReply = function(mirror, message) {
    var data = {
        'type': 'messaging_extension_reply',
        'source_user_iden': mirror.source_user_iden,
        'target_device_iden': mirror.source_device_iden,
        'package_name': mirror.package_name,
        'conversation_iden': mirror.conversation_iden,
        'message': message
    }

    var push
    if (pb.e2e.enabled) {
        push = {
            'encrypted' : true,
            'ciphertext': pb.e2e.encrypt(JSON.stringify(data)),
            'type': 'messaging_extension_reply'
        }
    } else {
        push = data
    }

    pb.post(pb.api + '/v2/ephemerals', {
        'type': 'push',
        'push': push
    }, function(response) {
        if (response) {
            pb.log('Forwarding reply to ' + mirror.package_name)
        } else {
            pb.log('Failed to forward reply to ' + mirror.package_name)
        }
    })
}
