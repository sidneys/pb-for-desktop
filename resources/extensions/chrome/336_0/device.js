'use strict'

var inProgress, retryTimeout

pb.addEventListener('signed_in', function(e) {
    inProgress = false

    if (localStorage.device) {
        try {
            pb.local.device = JSON.parse(localStorage.device)
        } catch (e) {
            delete localStorage.device
        }
    }

    pb.addEventListener('devices_ready', function(e) {
        createOrAttachDevice()
    })
})

var createOrAttachDevice = function() {
    clearTimeout(retryTimeout)

    if (inProgress) {
        pb.log('Device is already being created or attached')
        return
    } else {
        inProgress = true
    }

    var attachTo, device
    Object.keys(pb.local.devices).forEach(function(key) {
        device = pb.local.devices[key]
        if (device.active) {
            if ((pb.local.device && pb.local.device.iden == device.iden)
                || (device.type == pb.browser)) {
                attachTo = device
            }
        }
    })

    if (attachTo) {
        if (!pb.local.device) {
            pb.log('Attaching to existing device:')
            pb.log(attachTo)
        }

        pb.local.device = attachTo
        localStorage.device = JSON.stringify(attachTo)

        var needsUpdating = false
        var deviceValues = getDeviceValues()

        if (localStorage['keyFingerprintDirty']) {
            deviceValues['key_fingerprint'] = pb.e2e.getKeyFingerprint()
        }

        Object.keys(deviceValues).forEach(function(key) {
            if (deviceValues[key] != pb.local.device[key]) {
                needsUpdating = true
            }
        })
        if (needsUpdating) {
           updateDevice(deviceValues, function(response) {
               if (response) {
                    pb.local.device = response
                    localStorage.device = JSON.stringify(attachTo)
                    localStorage.removeItem('keyFingerprintDirty')
                } else {
                    var retryTimeout = setTimeout(function() {
                         pb.dispatchEvent('devices_ready')
                    }, 30 * 1000)
                }

                inProgress = false
            })
        } else {
            inProgress = false
        }
    } else if (pb.local.device && !attachTo) { // Device has been deleted
        inProgress = false
        pb.signOut()
    } else {
        createDevice(function(response) {
            if (response) {
                pb.local.device = response
                localStorage.device = JSON.stringify(response)
            } else {
                var retryTimeout = setTimeout(function() {
                     pb.dispatchEvent('devices_ready')
                }, 30 * 1000)
            }

            inProgress = false
        })
    }
}

var getDeviceValues = function() {
    var body = {}
    if (pb.browser == 'opera') {
        body['type'] = 'opera'
        body['manufacturer'] = 'Opera'
        body['model'] = 'Opera'
    } else if (pb.browser == 'firefox') {
        body['type'] = 'firefox'
        body['manufacturer'] = 'Mozilla'
        body['model'] = 'Firefox'
    } else {
        body['type'] = 'chrome'
        body['manufacturer'] = 'Google'
        body['model'] = 'Chrome'
    }
    return body
}

var createDevice = function(done) {
    pb.log('Creating device')

    var body = getDeviceValues()
    body['nickname'] = pb.browser.charAt(0).toUpperCase() + pb.browser.slice(1)
    body['app_version'] = pb.version

    pb.post(pb.api + '/v2/devices', body, function(response) {
        done(response)
    })
}

var updateDevice = function(deviceValues, done) {
    pb.log('Updating device')

    pb.post(pb.api + '/v2/devices/' + pb.local.device.iden, deviceValues, function(response) {
        done(response)
    })
}
