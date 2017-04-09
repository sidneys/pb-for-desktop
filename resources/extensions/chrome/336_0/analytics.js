'use strict'

var lastReported = {}

pb.track = function(event) {
    if (!chrome.runtime.getManifest().key) {
        pb.log('Not reporting ' + event.name + ' from dev installation')
        console.log(event)
        return
    }

    if (!event || !event.name) {
        pb.log('Ignoring event without name')
        return
    }

    event.client_type = pb.browser
    event.name = event.client_type + '_' + event.name
    event.client_version = pb.version
    event.language = navigator.language
    event.browser_version = pb.browserVersion
    event.platform = navigator.platform
    event.client_id = localStorage.client_id

    if (pb.local.user) {
        event.user_iden = pb.local.user.iden
    }

    var xhr = new XMLHttpRequest()
    xhr.open('POST', pb.andrelytics, true)
    xhr.setRequestHeader('X-User-Agent', pb.userAgent)
    xhr.setRequestHeader('Content-type', 'application/json')
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            try {
                if (xhr.status === 200) {
                    pb.log('Reported ' + event.name)
                } else {
                    pb.log('Failed to report ' + event.name)
                }
            } catch (e) {
            }
        }
    }
    xhr.send(JSON.stringify(event))
}

pb.trackPerHour = function(event) {
    var hour = 60 * 60
    trackPer(hour, event)
}

pb.trackPerDay = function(event) {
    var frequency = 12 * 60 * 60
    trackPer(frequency, event)
}

var trackPer = function(time, event) {
    var key = event.name + 'LastReported'
    var now = Math.floor(Date.now() / 1000)

    if (!lastReported[key] || parseInt(lastReported[key]) + time < now) {
        lastReported[key] = now
        pb.track(event)
    } else if (!chrome.runtime.getManifest().key) {
        pb.log('Ignoring ' + event.name + ', last reported ' + (now - parseInt(lastReported[key])) + ' seconds ago')
    }
}

window.onerror = function(message, file, line, column, error) {
    pb.track({
        'name': 'error',
        'stack': error ? error.stack : file + ':' + line + ':' + column,
        'message': message
    })
}
