chrome.commands.onCommand.addListener(function(command) {
    utils.wrap(function() {
        pb.log('Receieved command ' + command)

        if (command == 'dismiss-most-recent-notification') {
            if (Object.keys(pb.notifier.active).length > 0) {
                var sortedKeys = [], key
                for (key in pb.notifier.active) {
                    sortedKeys.push(key)
                }

                sortedKeys.sort(function(a, b) {
                    return pb.notifier.active[b].created - pb.notifier.active[a].created
                })

                key = sortedKeys[0]
                var notification = pb.notifier.active[key]

                pb.log('Dismissing ' + key + ' by keyboard shortcut')

                pb.notifier.dismiss(key)
            }
        } else if (command == 'instant-push-current-tab') {
            if (!pb.local.user) {
                pb.log('Can\'t instant push, not signed in')
                return
            } else if (!pb.settings.allowInstantPush) {
                pb.log('Can\'t instant push, not enabled in options')
                return
            } else if (!pb.settings.instantPushIden) {
                pb.log('Can\'t instant push, no device set in options')
                return
            }

            chrome.tabs.query({ 'active': true, 'lastFocusedWindow': true }, function(tabs) {
                if (!tabs || tabs.length < 1) {
                    return
                }

                var tab = tabs[0]

                var push = {
                    'type': 'link',
                    'title': tab.title,
                    'url': tab.url,
                }

                if (pb.settings.instantPushIden != '*') {
                    push['device_iden'] = pb.settings.instantPushIden
                }

                pb.sendPush(push)
            })
        } else if (command == 'pop-out-panel') {
            pb.popOutPanel()
        }

        pb.track({
            'name': 'keyboard_shortcut',
            'command': command
        })
    })
})
