'use strict'

var utils = { }

utils.TAB = 9
utils.ENTER = 13
utils.ESC = 27
utils.UP_ARROW = 38
utils.DOWN_ARROW = 40

utils.guid = function() {
    return Math.random().toString(36).slice(2)
}

utils.asArray = function(object) {
    return object && Object.keys(object).map(function(key) {
        return object[key]
    }) || []
}

utils.wrap = function(func) {
    try {
        func()
    } catch(e) {
        pb.track({
            'name': 'error',
            'stack': e.stack,
            'message': e.message
        })
        throw e
    }
}

utils.getParams = function(search) {
    var parse = function(params, pairs) {
        var pair = pairs[0]
        var parts = pair.split('=')
        var key = decodeURIComponent(parts[0])
        var value = decodeURIComponent(parts.slice(1).join('='))

        // Handle multiple parameters of the same name
        if (typeof params[key] === 'undefined') {
            params[key] = value
        } else {
            params[key] = [].concat(params[key], value)
        }

        return pairs.length == 1 ? params : parse(params, pairs.slice(1))
    }

    // Get rid of leading ?
    return search.length == 0 ? {} : parse({}, search.substr(1).split('&'))
}

utils.streamKeys = function(push) {
    var keys = []

    if (push.direction == 'self') {
        keys.push('me')
        
        if (push.client_iden) {
            keys.push(push.client_iden)
        } else {
            if (push.source_device_iden) {
                keys.push(push.source_device_iden)
            }
            if (push.target_device_iden) {
                keys.push(push.target_device_iden)
            }
        }
    } else if (push.direction == 'outgoing') {
        if (push.receiver_email_normalized) {
            keys.push(push.receiver_email_normalized)
        }
    } else if (push.direction == 'incoming') {
        if (push.channel_iden) {
            keys.push(push.channel_iden)
        } else if (push.client_iden) {
            keys.push(push.client_iden)
        } else if (push.sender_email_normalized) {
            keys.push(push.sender_email_normalized)
        }
    }

    return keys
}

utils.streamDisplayName = function(target) {
    if (!target) {
        return ''
    }

    var data = target.with || target
    var name = data.name || data.nickname || data.model || data.email
    if (data.phone) {
        name += ' - ' + data.phone
    }

    return name
}

utils.alphabetizeChats = function(chats) {
    chats.sort(function(a, b) {
        var an = (a.with.name ? a.with.name : a.with.email_normalized || '').toLowerCase()
        var bn = (b.with.name ? b.with.name : b.with.email_normalized || '').toLowerCase()
        if (an > bn) {
            return 1
        } else if (an < bn) {
            return -1
        } else {
            return 0
        }
    })
}

utils.checkNativeClient = function(callback) {
    var needsCheck = true

    if (pb && pb.local && pb.local.devices) {
        needsCheck = false
        utils.asArray(pb.local.devices).forEach(function(device) {
            if (device.type == 'windows' || device.type == 'mac') {
                needsCheck = true
            }
        })
    }

    if (needsCheck) {
        var xhr = new XMLHttpRequest()
        xhr.open('GET', 'http://localhost:20807/check', true)
        xhr.setRequestHeader('Accept', 'application/json')
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                var response
                try {
                    response = JSON.parse(xhr.responseText)
                } catch (e) {
                }
                
                callback(response)
            }
        }

        xhr.send()
    } else {
        callback()
    }
}

utils.base64ToBlob = function(base64Data, type) {
    var sliceSize = 1024
    var byteCharacters = atob(base64Data)
    var bytesLength = byteCharacters.length
    var slicesCount = Math.ceil(bytesLength / sliceSize)
    var byteArrays = new Array(slicesCount)

    for (var sliceIndex = 0; sliceIndex < slicesCount; sliceIndex++) {
        var begin = sliceIndex * sliceSize
        var end = Math.min(begin + sliceSize, bytesLength)
        var bytes = new Array(end - begin)
        for (var offset = begin, i = 0; offset < end; i++, offset++) {
            bytes[i] = byteCharacters[offset].charCodeAt(0)
        }
        byteArrays[sliceIndex] = new Uint8Array(bytes)
    }

    return new Blob(byteArrays, { type: type })
}

var linkRegex = new RegExp('^https?:\/\/[\\w.\\-\/?=,+*~!()\':#\\[@\\]\\$%&]+$')
utils.isLink = function(text) {
    return text.match(linkRegex)
}

var linkifyRegex = /\b((?:https?:\/\/)?[\w-_]+(?:\.(?=[\w+$&@/#=,\-()%|~?!:]+)[\w+$&@/#=\-()%|~?!:]*)+)/gi

var matchLinks = function(text) {
    var groups = []

    var match
    while (match = linkifyRegex.exec(text)) {
        groups.push(match[0])
    }

    return groups
}

utils.linkify = function(text, container) {
    var matches = matchLinks(text)
    if (matches.length > 0) {
        matches.forEach(function(match) {
            var startIndex = text.indexOf(match)
            var before = text.substring(0, startIndex)

            var span = document.createElement('span')
            span.textContent = before

            var a = document.createElement('a')
            a.textContent = match
            a.href = match.indexOf('http') == -1 ? 'http://' + match : match
            a.target = '_blank'

            container.appendChild(span)
            container.appendChild(a)

            text = text.substring(startIndex + match.length)
        })

        var span = document.createElement('span')
        span.textContent = text

        container.appendChild(span)
    } else {
        container.textContent = text
    }
}

utils.downloadImage = function(url, done) {
    if (url.substring(0, 4) == 'data') {
        done(utils.base64ToBlob(url.split(',')[1], url.split('')[0].split(':')[1]))
    } else {
        var xhr = new XMLHttpRequest()
        xhr.open('GET', url)
        xhr.responseType = 'blob'
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr.status === 200) {
                done(xhr.response)
            }
        }
        xhr.send()
    }
}

utils.imageNameFromUrl = function(url) {
    if (url.substring(0, 4) == 'data') {
        var type = url.split('')[0].split(':')[1]
        var now = new Date()
        return 'Image_' + now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate()
               + '-' + now.getHours() + '-' + now.getMinutes() + '-' + now.getSeconds() + '.' + type.split('/')[1]
    } else {
        return url.split('/').pop().split('?')[0].split(':')[0]
    }
}

utils.streamImageUrl = function(target) {
    if (target) {
        var data = target.with || target.channel || target.client || target

        if (data.image_url) {
            return data.image_url
        } else if (data.icon) {
            if (data.icon == 'phone') {
                return 'chip_phone.png'
            } else if (data.icon == 'tablet') {
                return 'chip_tablet.png'
            } else if (data.icon == 'desktop') {
                return 'chip_desktop.png'
            } else if (data.icon == 'laptop') {
                return 'chip_laptop.png'
            } else if (data.icon == 'browser') {
                return 'chip_browser.png'
            }
        } else if (data.kind) {
            if (['chrome', 'safari', 'opera', 'firefox'].indexOf(data.kind) != -1) {
                return 'chip_browser.png'
            } else if (['windows', 'mac'].indexOf(data.kind) != -1) {
                return 'chip_desktop.png'
            } else if (['android', 'ios'].indexOf(data.kind) != -1) {
                return 'chip_phone.png'
            }
        } else if (data.tag) {
            return 'chip_channel.png'
        } else if (data.phone_type) {
            if (data.phone_type == 'mobile') {
                return 'chip_phone.png'
            } else if (data.phone_type == 'home') {
                return 'chip_home.png'
            } else if (data.phone_type == 'work') {
                return 'chip_work.png'
            }
        } else if (data.email_normalized) {
            return 'chip_person.png'
        }
    }

    return 'chip_other.png'
}
