'use strict'

var smsDevices, smsDeviceInput, threadsHolder, smsInput, updateSmsChatInterval

var setUpSmsMessaging = function() {
    setUpInput()
    setUpSmsDevicePicker()

    pb.addEventListener('sms_changed', smsChangedListener)
    pb.addEventListener('locals_changed', smsLocalsChangedListener)

    var smsPickerHolder = document.getElementById('sms-picker-holder')
    var smsDisclaimer = document.getElementById('sms-disclaimer-tooltip')
    smsPickerHolder.onmouseenter = function() {
        smsDisclaimer.style.display = 'block'
    }

    smsPickerHolder.onmouseleave = function() {
        smsDisclaimer.style.display = 'none'
    }

    clearInterval(updateSmsChatInterval)
    updateSmsChatInterval = setInterval(function() {
        if (window && smsInput && smsInput.thread && smsInput.messages) {
            smsLocalsChangedListener()
        }
    }, 60 * 1000)
}

var tearDownSmsMessaging = function() {
    if (smsDeviceInput) {
        delete smsDeviceInput.target
    }

    clearInterval(updateSmsChatInterval)
    delete document.getElementById('sms-input').thread

    pb.removeEventListener('sms_changed', smsChangedListener)
    pb.removeEventListener('locals_changed', smsLocalsChangedListener)

    if (threadsHolder) {
        while (threadsHolder.hasChildNodes()) {
            threadsHolder.removeChild(threadsHolder.lastChild)
        }
    }

    var chatCell = document.getElementById('sms-chat-cell')
    while (chatCell.hasChildNodes()) {
        chatCell.removeChild(chatCell.lastChild)
    }

    updateActiveSmsChat()

    var banner = document.getElementById('messaging-banner')
    while (banner.hasChildNodes()) {
        banner.removeChild(banner.lastChild)
    }
    banner.style.display = 'none'

    localStorage.storedSms = document.getElementById('sms-input').value
}

var setUpSmsDevicePicker = function() {
    smsDevices = Object.keys(pb.local.devices).map(function(key) {
        return pb.local.devices[key]
    }).filter(function(device) {
        return device.has_sms
    }).sort(function(a, b) {
        return a.created - b.created
    })

    var pickerHolder = document.createElement('div')
    pickerHolder.id = 'sms-picker-holder'

    var pickerLabel = document.createElement('div')
    pickerLabel.className = 'picker-label'
    pickerLabel.textContent = chrome.i18n.getMessage('phone')

    var div = document.createElement('div')
    div.style.overflow = 'hidden'
    div.style.position = 'relative'

    smsDeviceInput = document.createElement('input')
    smsDeviceInput.id = 'sms-device'
    smsDeviceInput.type = 'text'

    var smsDeviceOverlay = document.createElement('div')
    smsDeviceOverlay.id = 'sms-device-overlay'
    smsDeviceOverlay.className = 'picker-overlay'

    div.appendChild(smsDeviceInput)
    div.appendChild(smsDeviceOverlay)

    var smsDevicePicker = document.createElement('div')
    smsDevicePicker.id = 'sms-device-picker'
    smsDevicePicker.className = 'picker'

    pickerHolder.appendChild(pickerLabel)
    pickerHolder.appendChild(div)
    pickerHolder.appendChild(smsDevicePicker)

    messagingLeft.appendChild(pickerHolder)

    threadsHolder = document.createElement('div')
    messagingLeft.appendChild(threadsHolder)

    picker.setUp({
        'inputId': 'sms-device',
        'pickerId': 'sms-device-picker',
        'overlayId': 'sms-device-overlay',
        'targets': smsDevices,
        'onselect': function(device) {
            while (threadsHolder.hasChildNodes()) {
                threadsHolder.removeChild(threadsHolder.lastChild)
            }

            smsChangedListener()
        }
    })
}

var updateSmsSendIcon = function() {
    var input = document.getElementById('sms-input')
    var sendIcon = document.getElementById('sms-send-icon')

    if (input.value.length > 0) {
        sendIcon.className = 'pushfont-send'
    } else {
        sendIcon.className = 'pushfont-paperclip'
    }
}

var smsChangedListener = function() {
    var device = smsDeviceInput.target
    if (device) {
        if (device.app_version >= 256) {
            pb.getThreads(device.iden, function(response) {
                if (device == smsDeviceInput.target) {
                    if (response) {
                        setUpThreads(response.threads)
                    } else {
                        setUpThreads()
                    }
                }
            })
            document.getElementById('sms-update-required').style.display = 'none'
        } else {
            document.getElementById('sms-update-required').style.display = 'block'
        }
    }
}

var smsLocalsChangedListener = function() {
    if (!smsInput.thread || !smsInput.messages) {
        return
    }

    updateSmsChat(smsDeviceInput.target, smsInput.thread, smsInput.messages)

    var banner = document.getElementById('messaging-banner')
    while (banner.hasChildNodes()) {
        banner.removeChild(banner.lastChild)
    }

    if (!pb.local.user.pro && pb.local.user.reply_count_quota) {
        banner.style.display = 'block'

        var span = document.createElement('span')

        var link = document.createElement('span')
        link.textContent = chrome.i18n.getMessage('reply_limit_upgrade')
        link.style.textDecoration = 'underline'
        link.style.cursor = 'pointer'

        if (pb.local.user.reply_count_quota == 'over_limit') {
            banner.style.backgroundColor = '#e85845'
            banner.style.color = 'white'
            span.textContent = chrome.i18n.getMessage('reply_limit_reached') + ' '

            link.onclick = function() {
                pb.openTab(pb.www + '/pro')
                pb.track({
                    'name': 'go_upgrade',
                    'source': 'sms_limit'
                })
            }
        } else {
            banner.style.backgroundColor = '#ecf0f0'
            banner.style.color = 'inherit'
            span.textContent = chrome.i18n.getMessage('reply_limit_warning') + ' '

            link.onclick = function() {
                pb.openTab(pb.www + '/pro')
                pb.track({
                    'name': 'go_upgrade',
                    'source': 'sms_warning'
                })
            }
        }

        banner.appendChild(span)
        banner.appendChild(link)
    } else {
        banner.style.display = 'none'
    }
}

var setUpInput = function() {
    updateSmsSendIcon()

    smsInput = document.getElementById('sms-input')
    var sendIcon = document.getElementById('sms-send-icon')

    smsInput.placeholder = chrome.i18n.getMessage('message_placeholder')

    smsInput.addEventListener('input', function(e) {
        reportAwake()
        updateSmsSendIcon()
    })

    var sendClicked = function() {
        smsInput.focus()

        if (!smsInput.value) {
            return
        }

        var addresses = smsInput.thread.recipients.map(function(recipient) {
            return recipient.address
        })

        pb.sendSms({
            'target_device_iden': smsDeviceInput.target.iden,
            'addresses': addresses,
            'body': smsInput.value
        })

        smsInput.value = ''
        updateSmsSendIcon()

        pb.track({
            'name': 'sms_send',
            'thread': true,
            'window': location.hash ? 'popout' : 'panel',
            'address_count': addresses.length
        })
    }

    document.getElementById('sms-send-holder').onclick = function() {
        if (smsInput.value.length == 0) {
            document.getElementById('file-input').click()
        } else {
            sendClicked()
        }
    }

    smsInput.onkeydown = function(e) {
        if (e.keyCode == utils.ENTER && !e.shiftKey) {
            sendClicked()
            return false
        }
    }
}

var setUpThreads = function(threads) {
    while (threadsHolder.hasChildNodes()) {
        threadsHolder.removeChild(threadsHolder.lastChild)
    }

    if (!pb.local.user) {
        return
    }

    var fragment = document.createDocumentFragment()

    var composeRow = newSmsRow()
    fragment.appendChild(composeRow)

    var selectedThread
    if (threads) {
        threads.forEach(function(thread) {
            var name, imageUrl
            if (thread.recipients.length == 1) {
                var recipient = thread.recipients[0]
                name = recipient.name

                if (recipient.image_url) {
                    imageUrl = recipient.image_url
                } else if (recipient.thumbnail) {
                    imageUrl = 'data:image/jpeg;base64,' + recipient.thumbnail
                } else {
                    imageUrl = 'chip_person.png'
                }
            } else {
                name = thread.recipients.map(function(recipient) { return recipient.name }).join(', ')
                imageUrl = 'chip_group.png'
            }

            var onPopOutClick = function(e) {
                e.stopPropagation()
                pb.openChat('sms', smsDeviceInput.target.iden + '_thread_' + thread.id)
            }

            var row = createStreamRow(imageUrl, name, thread.latest && thread.latest.body, null, onPopOutClick)
            row.id = thread.id
            row.onclick = function() {
                selectThread(thread)
            }

            if (thread.id == localStorage['lastTheadId_' + smsDeviceInput.target.iden]) {
                selectedThread = thread
            }

            fragment.appendChild(row)
        })
    }

    threadsHolder.appendChild(fragment)

    if (selectedThread) {
        selectThread(selectedThread)
    } else if (threads && threads.length > 0 && document.getElementById('sms-compose-right').style.display != 'block') {
        selectThread(threads[0])
    } else {
        selectCompose(composeRow)
    }
}

var newSmsRow = function() {
    var row = createStreamRow('chip_add.png', chrome.i18n.getMessage('new_sms_thread'))
    row.id = 'new_sms'
    row.onclick = function() {
        selectCompose(row)
    }

    return row
}

var selectThread = function(thread) {
    if (!thread || !smsDeviceInput.target) {
        return
    }

    clearSelectedStream()

    var row = document.getElementById(thread.id)
    if (row) {
        row.classList.add('selected')
    }

    var previousThread = smsInput.thread
    if (!previousThread) {
        scrollStreamRowIntoViewIfNecessary(row)
    }

    
    localStorage['lastTheadId_' + smsDeviceInput.target.iden] = thread.id
    delete smsInput.messages
    smsInput.thread = thread
    updateActiveSmsChat()

    document.getElementById('sms-compose-right').style.display = 'none'
    document.getElementById('sms-right').style.display = 'block'

    if (thread.recipients.length == 1 || smsDeviceInput.target.has_mms) {
        document.getElementById('sms-right-top').classList.add('with-input')
        document.getElementById('sms-right-bottom').style.display = 'block'
    } else {
        document.getElementById('sms-right-top').classList.remove('with-input')
        document.getElementById('sms-right-bottom').style.display = 'none'
    }

    if (previousThread && previousThread.id != thread.id) {
        updateSmsChat()
    }

    pb.getThread(smsDeviceInput.target.iden, thread.id, function(response) {
        if (thread == smsInput.thread) {
            if (response) {
                var messages = response.thread
                smsInput.messages = messages
                smsInput.focus()

                smsLocalsChangedListener()
            }
        }
    })
}

var selectCompose = function(row) {
    clearSelectedStream()
    delete smsInput.messages
    delete smsInput.thread
    row.classList.add('selected')
    updateActiveSmsChat()
    updateSmsChat()

    document.getElementById('sms-compose-right').style.display = 'block'
    document.getElementById('sms-right').style.display = 'none'

    var banner = document.getElementById('messaging-banner')
    if (banner.hasChildNodes()) {
        document.getElementById('sms-compose-right').style.marginTop = '56px'
    } else {
        document.getElementById('sms-compose-right').style.marginTop = '0'
    }

    var composeInput = document.getElementById('compose-message')
    composeInput.placeholder = chrome.i18n.getMessage('message_placeholder')
    composeInput.focus()

    composeInput.onkeydown = function(e) {
        if (e.keyCode == utils.ENTER && !e.shiftKey) {
            smsSendButton.onclick()
            return false
        }
    }

    var recipient = document.getElementById('compose-recipient')
    recipient.placeholder = chrome.i18n.getMessage('sms_recipient_placeholder')

    var smsSendButton = document.getElementById('compose-send-holder')
    smsSendButton.onclick = function() {
        composeInput.focus()

        if (!composeInput.value) {
            return
        }

        if (!recipient.target && !recipient.value) {
            return
        }

        var addresses = []
        addresses.push((recipient.target && recipient.target.phone) || recipient.value)

        pb.sendSms({
            'target_device_iden': smsDeviceInput.target.iden,
            'addresses': addresses,
            'body': composeInput.value
        })

        composeInput.value = ''

        scrollPushChat()

        pb.track({
            'name': 'sms_send',
            'thread': false
        })
    }

    pb.getPhonebook(smsDeviceInput.target.iden, function(data) {
        if (data) {
            var phonebook = data.phonebook.sort(function(a, b) {
                try {
                    var an = a.name.toLowerCase()
                    var bn = b.name.toLowerCase()
                    if (an > bn) {
                        return 1
                    } else if (an < bn) {
                        return -1
                    }
                } catch (e) { }
                return 0
            })

            picker.setUp({
                'inputId': 'compose-recipient',
                'pickerId': 'compose-recipient-picker',
                'overlayId': 'compose-recipient-overlay',
                'targets': phonebook,
                'noDefault': true,
                'onselect': function(target) {
                    setTimeout(function() {
                        composeInput.focus()
                    }, 100)
                }
            })
        }
    })
}

var updateActiveSmsChat = function() {
    var thread = document.getElementById('sms-input').thread
    if (thread && smsDeviceInput.target) {
        pb.setActiveChat(tabId, {
            'mode': 'sms',
            'other': smsDeviceInput.target.iden + '_thread_' + thread.id,
            'focused': focused
        })
    } else {
        pb.clearActiveChat(tabId)
    }
}
