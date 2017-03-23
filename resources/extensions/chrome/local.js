'use strict'

var types = ['devices', 'chats', 'grants', 'subscriptions', 'channels', 'pushes', 'texts']

pb.local = {}

pb.addEventListener('signed_in', function() {
    pb.syncing = false
    pb.pendingSync = false

    var errored = false
    types.forEach(function(type) {
        try {
            pb.local[type] = localStorage[type] ? JSON.parse(localStorage[type]) : {}
        } catch (e) {
            errored = true
        }
    })

    if (errored) {
        clearAndBootstrap()
    }

    pb.addEventListener('connected', function() {
        pb.sync()
    })

    pb.addEventListener('stream_message', function(e) {
        var message = e.detail
        if (message.type == 'tickle') {
            pb.sync()
        }
    })

    pb.addEventListener('locals_changed', function(e) {
        var guids = Object.keys(pb.successfulPushes)
        if (guids.length > 0) {
            utils.asArray(pb.local.pushes).forEach(function(push) {
                if (guids.indexOf(push.guid) != -1) {
                    delete pb.successfulPushes[push.guid]
                }
            })
        }
    })

    pb.addEventListener('locals_changed', function(e) {
        var guids = Object.keys(pb.successfulSms)
        if (guids.length > 0) {
            utils.asArray(pb.local.texts).forEach(function(text) {
                if (guids.indexOf(text.data.guid) != -1) {
                    delete pb.successfulSms[text.data.guid]
                }
            })
        }
    })
})

pb.addEventListener('signed_out', function(e) {
    pb.syncing = false
    pb.pendingSync = false
    pb.local = {}
})

pb.sync = function() {
    if (!pb.syncing) {
        pb.syncing = true
        pb.pendingSync = false
        syncInternal(10 * 1000, function() {
            pb.syncing = false
            if (pb.pendingSync) {
                pb.sync()
            }

            pb.dispatchEvent('locals_changed')
        })
    } else {
        pb.pendingSync = true
    }
}

var syncInternal = function(backoff, done) {
    clearTimeout(pb.syncTimeout)
    
    var body = {}
    if (localStorage.cursor) {
        body.cursor = localStorage.cursor
    }

    pb.post(pb.api + '/v2/sync', body , function(response, error) {
        if (response) {
            if (!response.cursor) {
                clearAndBootstrap()
                return
            }

            types.forEach(function(type) {
                var syncables = response[type]
                ingest(type, syncables, response.more)
            })

            var profile = response.profiles && response.profiles[0]
            if (profile) {
                localStorage.user = JSON.stringify(profile)
                pb.local.user = profile
            }

            localStorage.cursor = response.cursor

            if (response.more) {
                syncInternal(backoff, done)
            } else {
                done()
            }
        } else {
            if (error && error.code == 'invalid_cursor') {
                clearAndBootstrap()
                pb.track({
                    'name': 'invalid_cursor'
                })
            } else {
                pb.syncing = false
                pb.pendingSync = false

                pb.log('Sync failed, scheduling retry')

                pb.syncTimeout = setTimeout(function() {
                    pb.sync(Math.min(backoff * 2, 10 * 60 * 1000))
                }, backoff)
            }
        }
    })
}

var ingest = function(type, syncables, more) {
    var locals = pb.local[type]

    syncables.forEach(function(syncable) {
        if (syncable.active) {
            if (type == 'texts') {
                var decrypted = pb.e2e.decrypt(syncable.data.ciphertext)
                if (decrypted != null) {
                    syncable.data = JSON.parse(decrypted)
                }
            }

            locals[syncable.iden] = syncable
        } else {
            var deleted = locals[syncable.iden]
            delete locals[syncable.iden]

            if (deleted) {
                if (types == 'pushes') {
                    delete pb.successfulPushes[deleted.guid]
                } else if (types == 'texts') {
                    delete pb.successfulSms[deleted.data.guid]
                }
            }
        }
    })

    pb.local[type] = locals

    if (type == 'pushes') {
        pb.savePushes()
    } else {
        localStorage[type] = JSON.stringify(locals)
    }

    if (!more) {
        pb.dispatchEvent(type + '_ready')
    }
}


pb.savePushes = function() {
    pb.log('Saving pushes')
    smartlyPruneLocalPushes()
    localStorage.pushes = JSON.stringify(pb.local.pushes)
}

var smartlyPruneLocalPushes = function() {
    var streams = {}
    utils.asArray(pb.local.pushes).sort(function(a, b) {
        return b.modified - a.modified
    }).forEach(function(push) {
        var streamKeys = utils.streamKeys(push)
        streamKeys.forEach(function(streamKey) {
            var list = streams[streamKey]
            if (!list) {
                list = []
                streams[streamKey] = list
            }
            list.push(push)
        })
    })

    var filtered = {}
    Object.keys(streams).forEach(function(key) {
        var list = streams[key]
        list.slice(0, 50).forEach(function(push) {
            // Fix link urls
            if (push.url && push.url.indexOf('://') == -1) {
                push.url = 'http://' + push.url
            }

            filtered[push.iden] = push
        })
    })

    pb.local.pushes = filtered
}

var clearAndBootstrap = function() {
    pb.log('Clearing local data and bootstrapping')
    delete localStorage['cursor']
    types.forEach(function(type) {
        pb.local[type] = {}
        delete localStorage[type]
    })
    pb.syncing = false
    pb.pendingSync = false
    pb.sync()
}
