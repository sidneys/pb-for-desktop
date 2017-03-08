'use strict'

onFocusChanged = function() {
    if (activeMessagingTab == 'sms') {
        updateActiveSmsChat()
    } else {
        updateActivePushChat()
    }

    if (focused) {
        if (activeMessagingTab != 'sms') {
            pushesLocalsChangedListener()
        }
    }
}

var activeMessagingTab, messagingLeft, messagingRight

var setUpMessaging = function(tab) {
    messagingLeft = document.getElementById('messaging-content-left')
    messagingRight = document.getElementById('messaging-content-right')

    var pushRight = document.getElementById('push-right')
    var smsRight = document.getElementById('sms-right')

    document.getElementById('sms-input').value = localStorage.storedSms || ''

    tearDownMessaging()

    messagingRight.style.display = 'block'

    activeMessagingTab = tab

    if (activeMessagingTab == 'sms') {
        pushRight.style.display = 'none'
        smsRight.style.display = 'block'

        setUpSmsMessaging()
    } else {
        pushRight.style.display = 'block'
        smsRight.style.display = 'none'

        if (activeMessagingTab == 'devices') {
            setUpPushMessaging('devices')
        } else {
            setUpPushMessaging('people')
        }
    }

    setUpDropZone('messaging-content-right', 'drop-zone', function(file) {
        if (!file) {
            return
        }

        if (activeMessagingTab == 'sms') {
            handleSmsFile(file)
        } else {
            var target = getTargetStream()
            if (!target) {
                return
            }

            var push = {
                'file': file
            }

            addTarget(target, push)

            pb.sendPush(push)
        }
    })

    var fileInput = document.getElementById('file-input')
    fileInput.addEventListener('change', function(e) {
        if (activeMessagingTab == 'sms') {
            var file = e.target.files[0]
            if (!file) {
                return
            }

            handleSmsFile(file)
        } else {
            var target = getTargetStream()
            if (!target) {
                return
            }

            var files = e.target.files
            if (!files || files.length == 0) {
                return
            }

            for (var i = 0; i < files.length; i++) {
                var file = files[i]

                var push = {
                    'file': file
                }

                addTarget(target, push)

                pb.sendPush(push)
            }
        }

        fileInput.value = null
    }, false)
}

var tearDownMessaging = function() {
    resetMessagingContent()
    tearDownPushMessaging()
    tearDownSmsMessaging()
}

var resetMessagingContent = function() {
    if (messagingLeft) {
        while (messagingLeft.hasChildNodes()) {
            messagingLeft.removeChild(messagingLeft.lastChild)
        }

        messagingRight.style.display = 'none'
    }
}

var createStreamRow = function(imageUrl, name, description, descriptionCssClass, onPopOutClick) {
    var img = document.createElement('img')
    img.className = 'stream-row-image'
    img.src = imageUrl

    var content = document.createElement('div')
    content.className = 'stream-row-content'

    var line1 = document.createElement('div')
    line1.className = 'one-line'
    line1.textContent = name

    content.appendChild(line1)

    if (description) {
        var line2 = document.createElement('div')
        line2.className = 'one-line secondary'
        line2.textContent = description

        if (descriptionCssClass) {
            line2.classList.add(descriptionCssClass)
        }

        content.appendChild(line2)
    } else {
        line1.style.lineHeight = '36px'
    }

    var div = document.createElement('div')
    div.className = 'stream-row'
    div.appendChild(img)
    div.appendChild(content)

    if (onPopOutClick) {
        var popOutIcon = document.createElement('i')
        popOutIcon.className = 'pushfont-popout'

        var popOut = document.createElement('div')
        popOut.className = 'pop-out-stream'
        popOut.appendChild(popOutIcon)
        popOut.onclick = onPopOutClick

        div.appendChild(popOut)
    }

    return div
}

var clearSelectedStream = function() {
    var selectedSet = document.getElementsByClassName('stream-row selected')
    for (var i = 0; i < selectedSet.length; i++) {
        var selected = selectedSet[i]
        selected.classList.remove('selected')
    }
}

var scrollStreamRowIntoViewIfNecessary = function(row) {
    messagingLeft.scrollTop = 0

    if (row) {
        var index = 0, element = row
        while ((element = element.previousElementSibling) != null) {
            index++
        }
        
        if (index > 6) {
            row.scrollIntoView(true)
        }
    }
}

var handleSmsFile = function(file) {
    var device = smsDeviceInput.target
    var thread = smsInput.thread

    var img = document.createElement("img")
    img.onload = function() {
        var canvas = document.createElement('canvas')

        var preprocess = canvas.getContext('2d')
        preprocess.drawImage(img, 0, 0)

        var height = img.height
        var width = img.width

        if (width > height) {
            if (width > 1536) {
                height *= 1536 / width
                width = 1536
            }
        } else {
            if (height > 1536) {
                width *= 1536 / height
                height = 1536
            }
        }

        canvas.width = width
        canvas.height = height

        var context = canvas.getContext('2d')
        context.drawImage(img, 0, 0, width, height)

        var dataUrl = canvas.toDataURL(file.type)

        var mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0]

        var byteString
        if (dataUrl.split(',')[0].indexOf('base64') >= 0) {
            byteString = atob(dataUrl.split(',')[1])
        } else {
            byteString = unescape(dataUrl.split(',')[1])
        }

        var array = new Uint8Array(byteString.length)
        for (var i = 0; i < byteString.length; i++) {
            array[i] = byteString.charCodeAt(i)
        }

        var blob = new Blob([array], { 'type': mimeString })

        var addresses = thread.recipients.map(function(recipient) {
            return recipient.address
        })

        pb.sendSms({
            'target_device_iden': device.iden,
            'addresses': addresses,
            'file': blob
        })

        pb.track({
            'name': 'sms_send',
            'thread': true,
            'window': location.hash ? 'popout' : 'panel',
            'address_count': addresses.length,
            'image': true
        })
    }

    var reader = new FileReader()
    reader.onload = function(e) {
        img.src = e.target.result
    }

    if (file.type && file.type.indexOf('image/') == 0 && device && device.has_mms && thread) {
        reader.readAsDataURL(file)
    }
}
