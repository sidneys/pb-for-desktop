'use strict'

pb.pushQueue = []
pb.failedPushes = []
pb.successfulPushes = {}

pb.sendPush = function(push) {
    pb.clearFailed(push)

    if (push.file) {
        pb.pushFile(push)
        return
    }

    push.source_device_iden = pb.local.device ? pb.local.device.iden : null
    push.guid = utils.guid()

    push.queued = true
    pb.pushQueue.push(push)

    pb.dispatchEvent('locals_changed')

    processPushQueue()
}

pb.clearFailed = function(push) {
    pb.failedPushes = pb.failedPushes.filter(function(failed) {
        if (push != failed) {
            return failed
        }
    })

    pb.dispatchEvent('locals_changed')
}

var processingPush = false
var processPushQueue = function() {
    if (processingPush) {
        return
    }

    var push = pb.pushQueue[0]
    if (!push) {
        return
    }

    var real = {
        'type': push.type,
        'title': push.title,
        'body': push.body,
        'url': push.url,
        'file_name': push.file_name,
        'file_url': push.file_url,
        'file_type': push.file_type,
        'email': push.email,
        'device_iden': push.device_iden,
        'channel_tag': push.channel_tag,
        'client_iden': push.client_iden,
        'source_device_iden': push.source_device_iden,
        'guid': push.guid
    }

    processingPush = true

    pb.post(pb.api + '/v2/pushes', real, function(response) {
        pb.pushQueue.shift()

        processingPush = false

        if (response) {
            pb.successfulPushes[push.guid] = push

            if (response.iden) {
                pb.local.pushes[response.iden] = response
            }
        } else {
            push.failed = true
            pb.failedPushes.push(push)
        }

        pb.dispatchEvent('locals_changed')

        processPushQueue()
    })

    pb.dispatchEvent('active')
}
