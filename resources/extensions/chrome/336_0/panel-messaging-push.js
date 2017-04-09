'use strict'

var mode, updatePushChatInterval
var setUpPushMessaging = function(newMode) {
    mode = newMode

    setUpMeDevicePicker()
    setUpPushInput()
    setUpLinkAttacher()

    pushesLocalsChangedListener()

    pb.addEventListener('locals_changed', pushesLocalsChangedListener)

    var lastStreamId
    if (mode == 'devices') {
        lastStreamId = localStorage.lastDevicesTargetId
    } else {
        lastStreamId = localStorage.lastPeopleTargetId
    }

    var row = document.getElementById(lastStreamId) || messagingLeft.childNodes[0]
    if (row) {
        row.click()
    }

    scrollStreamRowIntoViewIfNecessary(row)

    clearInterval(updatePushChatInterval)
    updatePushChatInterval = setInterval(function() {
        if (window) {
            var stream = document.getElementById('push-input').stream
            if (stream) {
                updatePushChat(stream)
            }
        }
    }, 60 * 1000)
}

var tearDownPushMessaging = function() {
    clearInterval(updatePushChatInterval)
    pb.removeEventListener('locals_changed', pushesLocalsChangedListener)
    delete document.getElementById('push-input').stream
    updateActivePushChat()
    document.getElementById('push-link-close').click()
}

var pushesLocalsChangedListener = function() {
    if (!window) {
        return
    }

    if (!pb.local.user) {
        return
    }

    if (!messagingLeft) {
        return
    }

    while (messagingLeft.hasChildNodes()) {
        messagingLeft.removeChild(messagingLeft.lastChild)
    }

    setUpPushStreams()

    var stream = document.getElementById('push-input').stream
    if (stream) {
        var row = document.getElementById(stream.with ? stream.with.email_normalized : stream.iden)
        if (row) {
            row.classList.add('selected')
        }

        updatePushChat(stream)
    }
}

var setUpMeDevicePicker = function() {
    document.getElementById('me-device').placeholder = chrome.i18n.getMessage('devices_placeholder')

    var devices = utils.asArray(pb.local.devices).sort(function(a, b) {
        return b.created - a.created
    })

    devices.unshift({
        'iden': '*',
        'image_url': 'chip_everything.png',
        'name': chrome.i18n.getMessage('all_of_my_devices')
    })

    picker.setUp({
        'inputId': 'me-device',
        'pickerId': 'me-device-picker',
        'overlayId': 'me-device-overlay',
        'targets': devices
    })
}

var updatePushSendIcon = function() {
    var input = document.getElementById('push-input')
    var sendIcon = document.getElementById('push-send-icon')

    if (input.value.length > 0 || document.getElementById('push-link-holder').style.display == 'block') {
        sendIcon.className = 'pushfont-send'
    } else {
        sendIcon.className = 'pushfont-paperclip'
    }
}

var setUpPushInput = function() {
    updatePushSendIcon()

    var input = document.getElementById('push-input')
    input.placeholder = location.hash ? chrome.i18n.getMessage('message_placeholder_files') : chrome.i18n.getMessage('message_placeholder')
    delete input.stream

    input.addEventListener('input', function(e) {
        reportAwake()
        updatePushSendIcon()
    })

    var sendClicked = function() {
        input.focus()

        var target = getTargetStream()
        if (!target) {
            return
        }

        var push =  {
            'type': 'note',
        }

        if (document.getElementById('push-link-holder').style.display == 'block') {
            var linkTitle = document.getElementById('push-link-title')
            var linkUrl = document.getElementById('push-link-url')

            if (linkUrl.value) {
                push.type = 'link'
                push.url = linkUrl.value
                push.tabId = linkUrl.tabId
            }
            if (linkTitle.value) {
                push.title = linkTitle.value
            }

            if (input.value) {
                push.body = input.value
            }
        } else {
            if (input.value) {
                if (utils.isLink(input.value)) {
                    push.type = 'link'
                    push.url = input.value
                } else {
                    push.body = input.value
                }
            }
        }

        if (!push.body && !push.url && !push.title) {
            return
        }

        addTarget(target, push)

        pb.sendPush(push)

        input.value = ''

        document.getElementById('push-link-close').click()

        updatePushSendIcon()
        reportAwake()
        scrollPushChat()
    }

    document.getElementById('push-send-holder').onclick = function() {
        if (input.value.length == 0 && document.getElementById('push-link-holder').style.display != 'block') {
            document.getElementById('file-input').click()
        } else {
            sendClicked()
        }
    }

    input.onkeydown = function(e) {
        if (e.keyCode == utils.ENTER && !e.shiftKey) {
            sendClicked()
            return false
        }
    }

    if (location.hash) {
        document.getElementById('push-input-holder').style.marginLeft = '15px'
    }
}

var getTargetStream = function() {
    var stream = document.getElementById('push-input').stream
    if (stream) {
        if (stream.iden == '*') {
            var device = document.getElementById('me-device').target
            return device
        } else {
            return stream
        }
    }
}

var addTarget = function(target, push) {
    if (target.with) {
        push.email = target.with.email_normalized
    } else if (target.tag) {
        push.channel_tag = target.tag
    } else if (target.iden == '*') {
    } else {
        push.device_iden = target.iden
    }
}

var setUpPushStreams = function() {
    var latestMap = { }, latestSelfPush
    Object.keys(pb.local.pushes).forEach(function(iden) {
        var push = pb.local.pushes[iden]

        var keys = utils.streamKeys(push)
        keys.forEach(function(key) {
            var existing = latestMap[key]
            if (!existing || existing.created < push.created) {
                latestMap[key] = push
            }
        })

        if (push.direction == 'self' && !push.client_iden) {
            if (!latestSelfPush || latestSelfPush.created < push.created) {
                latestSelfPush = push
            }
        }
    })

    var fragment = document.createDocumentFragment()

    var streams = (mode == 'devices') ? utils.asArray(pb.local.devices) : utils.asArray(pb.local.chats)

    var latestKey = function(target) {
        return target.with ? target.with.email_normalized : target.client ? target.client.iden : target.channel ? target.channel.iden : target.iden
    }

    streams.sort(function(a, b) {
        var al = latestMap[latestKey(a)]
        var bl = latestMap[latestKey(b)]
        if (al && !bl) {
            return -1
        } else if (!al && bl) {
            return 1
        } else if (al && bl) {
            return bl.created - al.created
        } else {
            var an, bn
            if (a.with) {
                an = a.with.name ? a.with.name.toLowerCase() : a.with.email_normalized
            } else {
                an = (a.name || a.nickname || a.model || a.tag).toLowerCase()
            }
            if (b.with) {
                bn = b.with.name ? b.with.name.toLowerCase() : b.with.email_normalized
            } else {
                bn = (b.name || b.nickname || b.model || b.tag).toLowerCase()
            }

            if (an > bn) {
                return 1
            } else if (an < bn) {
                return -1
            } else {
                return 0
            }
        }
    })

    if (mode == 'devices') {
        var allDevicesRow = function() {
            var name = chrome.i18n.getMessage('all_of_my_devices')
            var imageUrl = 'chip_everything.png'

            var description, descriptionCssClass
            if (latestSelfPush) {
                description = latestSelfPush.title || latestSelfPush.body || latestSelfPush.url || latestSelfPush.file_name
            }

            var row = createStreamRow(imageUrl, name, description, descriptionCssClass)
            row.id = '*'
            row.onclick = function() {
                selectPushStream({ 'iden': row.id })
            }

            return row
        }

        fragment.appendChild(allDevicesRow())
    } else {
        var meRow = function() {
            var name = chrome.i18n.getMessage('me')
            var imageUrl = pb.local.user.image_url || 'chip_person.png'
            
            var description, descriptionCssClass
            if (latestSelfPush) {
                description = latestSelfPush.title || latestSelfPush.body || latestSelfPush.url || latestSelfPush.file_name
            }

            var row = createStreamRow(imageUrl, name, description, descriptionCssClass)
            row.id = '*'
            row.onclick = function() {
                selectPushStream({ 'iden': row.id })
            }

            return row
        }

        fragment.appendChild(meRow())
    }

    streams.forEach(function(stream) {
        var name = utils.streamDisplayName(stream)
        var imageUrl = utils.streamImageUrl(stream)

        var description, descriptionCssClass

        var latest = latestMap[latestKey(stream)]
        if (latest) {
            description = latest.title || latest.body || latest.url || latest.file_name

            if ((stream.tag || stream.with) && latest.direction == 'incoming') {
                if (!latest.dismissed) {
                    descriptionCssClass = 'bold'
                } else if (latest.awake_app_guids && latest.awake_app_guids.indexOf('extension-' + localStorage.client_id) != -1) {
                    descriptionCssClass = 'bold'
                }
            }
        }

        var onPopOutClick
        if (!!stream.with) {
            onPopOutClick = function(e) {
                e.stopPropagation()
                pb.openChat('push', stream.with.email_normalized)
            }
        }

        var row = createStreamRow(imageUrl, name, description, descriptionCssClass, onPopOutClick)
        row.id = stream.with ? stream.with.email_normalized : stream.iden
        row.onclick = function() {
            selectPushStream(stream)
        }

        fragment.appendChild(row)
    })

    if (mode != 'devices') {
       var addFriendRow = function() {
            var name = chrome.i18n.getMessage('add_a_friend')
            var imageUrl = 'chip_add.png'

            var row = createStreamRow(imageUrl, name)
            row.onclick = function() {
                pb.openTab(pb.www + '/#people/new')
            }

            return row
        }

        fragment.appendChild(addFriendRow())
    }

    messagingLeft.appendChild(fragment)
}

var selectPushStream = function(stream) {
    clearSelectedStream()

    var id
    if (stream) {
        id = stream.with ? stream.with.email_normalized : stream.iden
    } else {
        id = '*'
    }

    document.getElementById(id).classList.add('selected')

    var input = document.getElementById('push-input')
    input.stream = stream
    input.value = ''
    input.focus()

    if (mode == 'devices') {
        localStorage.lastDevicesTargetId = id
    } else {
        localStorage.lastPeopleTargetId = id
    }

    if (!location.hash && (stream.pushable || stream.iden == '*') && pb.settings.automaticallyAttachLink) {
        if (document.getElementById('push-link-holder').style.display != 'block') {
            document.getElementById('push-add-link').click()
        }
    } else {
        document.getElementById('push-link-close').click()
    }

    var pushRightTop = document.getElementById('push-right-top')
    var devicePickerHolder = document.getElementById('me-device-picker-holder')
    if (stream.iden == '*' && mode != 'devices') {
        devicePickerHolder.style.display = 'block'
        pushRightTop.classList.add('with-picker')
    } else {
        devicePickerHolder.style.display = 'none'
        pushRightTop.classList.remove('with-picker')
    }

    updateActivePushChat()
    updatePushChat(stream)
    scrollPushChat()
}

var setUpLinkAttacher = function() {
    var input = document.getElementById('push-input')
    var addLink = document.getElementById('push-add-link')
    var addLinkTooltop = document.getElementById('push-add-link-tooltip')
    var addLinkPoker = document.getElementById('push-link-holder-poker')
    var removeLink = document.getElementById('push-link-close')
    var sendHolder = document.getElementById('push-send-holder')
    var inputHolder = document.getElementById('push-input-holder')
    var linkHolder = document.getElementById('push-link-holder')
    var linkTitle = document.getElementById('push-link-title')
    var linkUrl = document.getElementById('push-link-url')
    var favicon = document.getElementById('push-link-favicon')
    var devicePicker = document.getElementById('me-device-picker')
    var pushRightTop = document.getElementById('push-right-top')

    addLink.onmouseenter = function() {
        addLinkTooltop.style.display = 'block'
    }

    addLink.onmouseleave = function() {
        addLinkTooltop.style.display = 'none'
    }

    linkTitle.placeholder = chrome.i18n.getMessage('title_placeholder')
    linkUrl.placeholder = chrome.i18n.getMessage('url_placeholder')

    var attach = function() {
        chrome.tabs.query({ 'active': true, 'lastFocusedWindow': true }, function(tabs) {
            var tab = tabs[0]
            
            if (!tab  || !tab.url || tab.url.indexOf('http') != 0) {
                removeLink.onclick()
                return
            }

            addLink.onclick = remove
            addLinkTooltop.textContent = chrome.i18n.getMessage('remove_link_tooltip')

            input.placeholder = chrome.i18n.getMessage('message_placeholder_link')

            linkHolder.style.display = 'block'
            addLinkPoker.style.display = 'block'

            sendHolder.classList.add('with-link')
            inputHolder.classList.add('with-link')
            addLink.classList.add('with-link')
            devicePicker.classList.add('with-link')
            pushRightTop.classList.add('with-link')

            linkTitle.value = tab.title || ''
            linkUrl.value = tab.url || ''
            linkUrl.tabId = tab.id
            favicon.src = tab.favIconUrl || 'link.png'

            updatePushSendIcon()
            scrollPushChat()      
        })
    }

    var remove = function() {
        addLink.onclick = attach
        addLinkTooltop.textContent = chrome.i18n.getMessage('add_link_tooltip')

        input.placeholder = location.hash ? chrome.i18n.getMessage('message_placeholder_files') : chrome.i18n.getMessage('message_placeholder')

        linkHolder.style.display = 'none'
        addLinkPoker.style.display = 'none'

        sendHolder.classList.remove('with-link')
        addLink.classList.remove('with-link')
        devicePicker.classList.remove('with-link')
        pushRightTop.classList.remove('with-link')

        if (location.hash) {
            inputHolder.classList.add('with-link')
            addLink.style.display = 'none'
        } else {
            inputHolder.classList.remove('with-link')
            addLink.style.display = 'block'
        }

        updatePushSendIcon()
    }

    addLink.onclick = attach
    removeLink.onclick = remove
}

var updateActivePushChat = function() {
    var stream = document.getElementById('push-input').stream
    if (stream && stream.with && stream.with.email_normalized) {
        pb.setActiveChat(tabId, {
            'mode': 'push',
            'other': stream.with.email_normalized,
            'focused': focused
        })
    } else {
        pb.clearActiveChat(tabId)
    }
}
