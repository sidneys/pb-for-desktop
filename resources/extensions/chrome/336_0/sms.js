'use strict'

pb.addEventListener('signed_in', function(e) {
    pb.smsQueue = []
    pb.successfulSms = {}
    pb.threads = {}
    pb.thread = {}

    pb.addEventListener('connected', function(e) {
        pb.smsQueue = []
        pb.thread = {}
        pb.threads = {}

        Object.keys(pb.notifier.active).forEach(function(key) {
            if (key.indexOf('sms') != -1) {
                pb.notifier.dismiss(key)
            }
        })
    })

    pb.addEventListener('stream_message', function(e) {
        var message = e.detail
        if (message.type != 'push' || !message.push) {
            return
        }

        var push = message.push
        if (push.type == 'sms_changed') {
            pb.dispatchEvent('sms_changed', push)
        }
    })

    pb.addEventListener('sms_changed', function(e) {
        pb.thread = {}
        pb.threads = {}

        if (!e.detail || !e.detail.notifications) {
            return
        }

        var device = pb.local.devices[e.detail.source_device_iden]
        if (!device) {
            return
        }

        if (e.detail.notifications.length > 0) {
            var notification = e.detail.notifications[0]

            var chatInfo = pb.findChat(device.iden + '_thread_' + notification.thread_id)
            if (chatInfo && chatInfo.focused) {
                return
            }

            var options = {}
            options.type = 'basic'
            options.key = 'sms'
            options.iconUrl = notification.image_url || 'chip_person.png'
            options.title = notification.title
            options.message = notification.body
            options.buttons = []

            try {
                options.contextMessage = chrome.i18n.getMessage('push_context_message', [chrome.i18n.getMessage('sms'), new Date(Math.floor(notification.timestamp * 1000)).toLocaleTimeString().replace(/:\d+ /, ' ')])
            } catch (e) {
                options.contextMessage = chrome.i18n.getMessage('sms')
            }

            options.onclick = function() {
                openSmsWindow(device.iden, notification.thread_id)
                sendSmsDismissal()
            }

            options.buttons.push({
                'title': chrome.i18n.getMessage('reply'),
                'iconUrl': 'action_reply.png',
                'onclick': function() {
                    openSmsWindow(device.iden, notification.thread_id)
                    sendSmsDismissal()
                }
            })

            options.buttons.push({
                'title': chrome.i18n.getMessage('dismiss'),
                'iconUrl': 'action_cancel.png',
                'onclick': function() {
                    sendSmsDismissal()
                }
            })

            utils.checkNativeClient(function(response) {
                if (!response) {
                    pb.notifier.show(options)
                }
            })
        }
    })
})

var mapify = function(response) {
    if (!response) {
        return null
    }

    var map = {}
    response.threads.forEach(function(thread) {
        map[thread.id] = thread
    })

    return map
}

var openSmsWindow = function(deviceIden, threadId) {
    pb.openChat('sms', deviceIden+ '_thread_' + threadId)
}

var sendSmsDismissal = function() {
    var dismissal = {
        'type': 'dismissal',
        'source_user_iden': pb.local.user.iden,
        'package_name': 'sms',
        'notification_id': 0
    }

    pb.post(pb.api + '/v2/ephemerals', {
        'type': 'push',
        'push': dismissal,
        'targets': ['stream', 'android']
    }, function(response) {
        if (response) {
            pb.log('Triggered remote sms dismissal')
        } else {
            pb.log('Failed to trigger remote sms dismissal')
        }
    })
}

var getSmsDevices = function() {
    return utils.asArray(pb.local.devices).filter(function(device) { return device.has_sms })
}

pb.getThreads = function(deviceIden, callback) {
    if (!pb.threads[deviceIden]) {
        var body = {
            'key': deviceIden + '_threads'
        }

        pb.post(pb.api + '/v3/get-permanent', body, function(response) {
            var data
            if (response) {
                if (response.data.encrypted) {
                    data = JSON.parse(pb.e2e.decrypt(response.data.ciphertext))
                } else {
                    data = response.data
                }
            }

            pb.threads[deviceIden] = data
            callback(pb.threads[deviceIden])
        })
    } else {
        callback(pb.threads[deviceIden])
    }
}

pb.getThread = function(deviceIden, threadId, callback) {
    var body = {
        'key': deviceIden+ '_thread_' + threadId
    }

    if (pb.thread[body.key]) {
        callback(pb.thread[body.key])
    } else {
        pb.post(pb.api + '/v3/get-permanent', body, function(response) {
            var data
            if (response) {
                if (response.data.encrypted) {
                    data = JSON.parse(pb.e2e.decrypt(response.data.ciphertext))
                } else {
                    data = response.data
                }
            }

            if (data) {
                data.thread.reverse()
            }

            pb.thread[body.key] = data
            callback(pb.thread[body.key])
        })
    }
}

pb.getPhonebook = function(deviceIden, callback) {
    var body = {
        'key': 'phonebook_' + deviceIden,
    }

    pb.post(pb.api + '/v3/get-permanent', body, function(response) {
        var data
        if (response) {
            if (response.data.encrypted) {
                data = JSON.parse(pb.e2e.decrypt(response.data.ciphertext))
            } else {
                data = response.data
            }
        }

        callback(data)
    })
}

pb.sendSms = function(data) {
    var sms = {
        'target_device_iden': data.target_device_iden,
        'addresses': data.addresses,
        'guid': utils.guid(),
        'status': 'queued',
        'direction': 'outgoing'
    }

    if (data.body) {
        sms.body = data.body
    }

    if (data.file) {
        sms.file = data.file
        pb.smsFile(sms)
        return
    } else if (data.file_url) {
        sms.file_url = data.file_url
        sms.file_type = data.file_type
    }

    pb.smsQueue.push(sms)

    pb.dispatchEvent('locals_changed')

    processSmsQueue()

    return sms
}

pb.deleteText = function(iden) {
    pb.log('delete text ' + iden)

    pb.post(pb.api + '/v3/delete-text', {
        'iden': iden
    }, function(response, error) {
        if (error && error.code == 'not_found') {
            delete pb.local.texts[iden]
            pb.log('Attempted to delete text that has already been deleted, clearing')
        }
    })
}

var processingSms = false
var processSmsQueue = function() {
    if (processingSms) {
        return
    }

    var sms = pb.smsQueue[0]
    if (!sms) {
        return
    }

    processingSms = true

    var data = {
        'addresses': sms.addresses,
        'message': sms.body,
        'target_device_iden': sms.target_device_iden,
        'guid': sms.guid,
        'file_type': sms.file_type
    }

    if (pb.e2e.enabled) {
        data = {
            'encrypted' : true,
            'ciphertext': pb.e2e.encrypt(JSON.stringify(data)),
            'target_device_iden': data.target_device_iden
        }
    }

    pb.smsQueue.shift()
    pb.successfulSms[sms.guid] = sms

    pb.post(pb.api + '/v3/create-text', {
        'data': data,
        'file_url': sms.file_url
    }, function(response, error) {
        processingSms = false

        if (response) {
        } else {
            delete pb.successfulSms[sms.guid]
        }

        pb.dispatchEvent('locals_changed')

        processSmsQueue()
    })

    pb.dispatchEvent('active')
}

pb.sendRefreshSms = function(device) {
    var data = {
        'type': 'refresh_sms',
        'source_user_iden': pb.local.user.iden,
        'target_device_iden': device.iden
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
        'push': push,
        'targets': ['android']
    }, function(response) {
        pb.log('Sent refresh_sms to ' + device.iden)
    })
}
