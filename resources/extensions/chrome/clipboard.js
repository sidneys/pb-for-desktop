'use strict'

var textarea = document.createElement('textarea')
document.body.appendChild(textarea)

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

        if (push.type != 'clip') {
            return
        }

        receivedClip(push)
    })

    updateClip(function() { })

    clearTimeout(pb.clipboardTimeout)

    var checkClipboard = function(delay) {
        pb.clipboardTimeout = setTimeout(function() {
            checkClipboardPermissions(function(granted) {
                if (granted) {
                    updateClip(function(clip) {
                        if (clip) {
                            utils.checkNativeClient(function(response) {
                                if (!response) {
                                    publishClip(clip)
                                }

                                checkClipboard(500)
                            })
                        } else {
                            checkClipboard(500)
                        }
                    })
                } else {
                    checkClipboard(5000)
                }
            })
        }, delay)
    }

    checkClipboard(1000)
})

pb.addEventListener('signed_out', function(e) {
    clearTimeout(pb.clipboardTimeout)
})

var receivedClip = function(clip) {
    checkClipboardPermissions(function(granted) {
        utils.checkNativeClient(function(response) {
            if (!response) {
                textarea.value = clip.body
                textarea.select()
                pb.lastClip = textarea.value
                document.execCommand('copy')
            }
        })
    })
}

var updateClip = function(callback) {
    textarea.value = ''
    textarea.focus()
    document.execCommand('paste')

    if (textarea.value != '' && textarea.value != pb.lastClip) {
        pb.lastClip = textarea.value
        callback(pb.lastClip)
    } else {
        callback()
    }
}

var publishClip = function(clip) {
    var data = {
        'type': 'clip',
        'source_user_iden': pb.local.user.iden,
        'source_device_iden': pb.local.device.iden,
        'body': clip
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
            pb.log('Published clip')
        } else {
            pb.log('Failed to publish clip')
        }
    })
}

var checkClipboardPermissions = function(callback) {
    if (pb.local.user && pb.local.user.pro && chrome.permissions) {
        chrome.permissions.contains({ 'permissions': ['clipboardRead', 'clipboardWrite'] }, function(granted) {
            callback(granted)
        })
    } else {
        callback(false)
    }
}
