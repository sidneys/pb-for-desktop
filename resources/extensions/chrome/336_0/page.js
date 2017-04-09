'use strict'

var focused = true, onFocusChanged
window.addEventListener('focus', function() {
    focused = true

    if (onFocusChanged) {
        onFocusChanged()
    }

    pb.dispatchEvent('active')
})
window.addEventListener('blur', function() {
    focused = false

    if (onFocusChanged) {
        onFocusChanged()
    }
})

var onload = function() {
    onload = null
    window.pb = chrome.extension.getBackgroundPage().pb
    ready()
}

var ready = function() {
    addBodyCssClasses()

    window.init()

    pb.dispatchEvent('active')
}

var addBodyCssClasses = function() {
    if (pb.local && pb.local.user) {
        document.body.classList.add('signed-in')
    } else {
        document.body.classList.add('not-signed-in')
    }

    if (pb.browser == 'chrome') {
        document.body.classList.add('chrome')
    } else {
        document.body.classList.add('not-chrome')
    }

    if (pb.browser == 'opera') {
        document.body.classList.add('opera')
    } else {
        document.body.classList.add('not-opera')
    }

    if (pb.browser == 'safari') {
        document.body.classList.add('safari')
    } else {
        document.body.classList.add('not-safari')
    }

    if (pb.browser == 'firefox') {
        document.body.classList.add('firefox')
    } else {
        document.body.classList.add('not-firefox')
    }

    if (navigator.platform.indexOf('MacIntel') != -1) {
        document.body.classList.add('mac')
    } else {
        document.body.classList.add('not-mac')
    }

    if (navigator.platform.toLowerCase().indexOf('win') != -1) {
        document.body.classList.add('windows')
    } else {
        document.body.classList.add('not-windows')
    }
}

document.addEventListener('DOMContentLoaded', onload)

window.onerror = function(message, file, line, column, error) {
    pb.track({
        'name': 'error',
        'stack': error ? error.stack : file + ':' + line + ':' + column,
        'message': message
    })
}
