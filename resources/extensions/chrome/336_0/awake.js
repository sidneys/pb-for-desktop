'use strict'

pb.awakeState = {}
pb.awakeTimeout = 60 * 1000

pb.setAwake = function(reason, awake) {
    pb.awakeState[reason] = {
        'awake': awake,
        'timestamp': Date.now()
    }

    updateAwake(false)
}

pb.fallAsleep = function() {
    Object.keys(pb.awakeState).forEach(function(key) {
        pb.awakeState[key].awake = false
    })

    setAwake(false)
}

var updateAwake = function(interval) {
    var awake = false
    Object.keys(pb.awakeState).forEach(function(key) {
        var state = pb.awakeState[key]
        if (state.awake) {
            var delta = Date.now() - state.timestamp
            if (delta < pb.awakeTimeout) {
                awake = true
            }
        }
    })

    if (!interval) {
        setAwake(awake)
    } else {
        pb.awake = awake
    }
}

var lastReportedAwake
var setAwake = function(awake) {
    if (!pb.local.device) {
        return
    }

    if (pb.awake == awake) {
        if (awake && Date.now() - lastReportedAwake < (pb.awakeTimeout - (10 * 1000))) {
            return
        } else if (!awake) {
            return
        }
    }

    lastReportedAwake = Date.now()

    pb.awake = awake
    pb.dispatchEvent('locals_changed')

    pb.post(pb.api + '/v3/set-app-state', {
        'guid': 'extension-' + localStorage.client_id,
        'awake': awake
    }, function(response) {
        if (response) {
            pb.log('Set awake state to ' + awake)
        } else {
            pb.log('Failed to set awake state to ' + awake)
        }
    })
}

setInterval(function() {
    updateAwake(true)
}, 10 * 1000)
