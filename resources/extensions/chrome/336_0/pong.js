'use strict'

pb.addEventListener('signed_in', function(e) {
    pb.addEventListener('stream_message', function(e) {
        var message = e.detail
        if (message.type != 'push' || !message.push) {
            return
        }

        var push = message.push
        if (push.type != 'ping') {
            return
        }

        if (!pb.local.device) {
            return
        }

        pb.log('Sending pong')

        var pong = {
            'type': 'pong',
            'device_iden': pb.local.device.iden
        }

        pb.post(pb.api + '/v2/ephemerals', {
            'type': 'push',
            'push': pong
        }, function(response) {
        })
    })
})

var sendPing = function() {
    var ping = {
        'type': 'ping'
    }

    pb.post(pb.api + '/v2/ephemerals', {
        'type': 'push',
        'push': ping
    }, function(response) {
    })
}
