'use strict'

window.init = function() {
    var banner = document.getElementById('banner')
    if (!pb.local.user.pro && pb.local.user.reply_count_quota) {
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
                    'source': 'quick_reply_limit'
                })
            }

            document.getElementById('reply').disabled = true
        } else {
            banner.style.backgroundColor = '#ecf0f0'
            banner.style.color = 'inherit'
            span.textContent = chrome.i18n.getMessage('reply_limit_warning') + ' '

            link.onclick = function() {
                pb.openTab(pb.www + '/pro')
                pb.track({
                    'name': 'go_upgrade',
                    'source': 'quick_reply_warning'
                })
            }
        }

        banner.appendChild(span)
        banner.appendChild(link)
    }

    chrome.runtime.sendMessage({ 'type': 'quickreply_get_mirror' }, function(mirror) {
        show(mirror)
    })
}

var show = function(mirror) {
    pb.track({
        'name': 'messaging_quickreply_shown',
        'package_name': mirror.package_name
    })

    document.getElementById('image').src = 'data:image/png;base64,' + mirror.icon
    document.getElementById('title').textContent = mirror.title
    document.getElementById('desc').textContent = 'Via ' + (mirror.package_name == 'com.pushbullet.android' ? 'SMS' : mirror.application_name)

    utils.linkify(mirror.body, document.getElementById('message'))

    var reply = document.getElementById('reply')
    reply.onkeydown = function(e) {
        if (e.keyCode == utils.ENTER && !e.shiftKey) {
            if (reply.value.length > 0) {
                sendReply(mirror, reply.value)
            }
            return false
        }
    }
    
    var heightNeeded = document.body.offsetHeight - window.innerHeight
    window.resizeBy(0, heightNeeded)
}

var sendReply = function(mirror, reply) {
    pb.sendReply(mirror, reply)

    pb.track({
        'name': 'messaging_quickreply_sent',
        'package_name': mirror.package_name
    })

    setTimeout(function() {
        window.close()
    }, 120)
}

window.onunload = function() {
    try {
        localStorage['quickReplyScreenX'] = window.screenX
        localStorage['quickReplyScreenY'] = window.screenY
    } catch (e) {
    }
}
