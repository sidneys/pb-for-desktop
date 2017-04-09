'use strict'

pb.addEventListener('signed_in', function(e) {
    pb.addEventListener('stream_message', function(e) {
        var message = e.detail
        if (message.type != 'push' || !message.push) {
            return
        }

        var push = message.push
        if (push.type != 'log_request') {
            return
        }

        pb.log('Log data requested')

        pb.post(pb.api + '/v2/error-report', {
            'reply_to': pb.local.user.email,
            'subject': 'Browser log file requested for ' + pb.local.user.email,
            'body': '',
            'data': pb.rollingLog.join('\n')
        }, function(response) {
        })
    })
})
