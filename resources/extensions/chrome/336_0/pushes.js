'use strict'

var pendingGroups = {}

pb.addEventListener('signed_in', function() {
    pb.visibleGroups = {}

    pb.addEventListener('pushes_ready', function() {
        var notifyAfter = parseFloat(localStorage.notifyAfter) || 0

        var pushes = utils.asArray(pb.local.pushes).sort(function(a, b) {
            return b.modified - a.modified
        }).filter(function(push) {
            return push.modified > notifyAfter
        })

        if (localStorage.notifierArmed) {
            var filtered = pushes.filter(function(push) {
                return needsNotifying(push)
            })

            if (filtered.length > 0) {
                localStorage.notifyAfter = filtered[filtered.length - 1].modified - 10
            } else if (pushes.length > 0) {
                localStorage.notifyAfter = pushes[0].modified - 10
            }

            utils.wrap(function() {
                var groups = groupify(filtered)
                updateNotifications(groups)
                pb.savePushes()
            })
        } else {
            localStorage.notifierArmed = true
            localStorage.notifyAfter = pushes.length > 0 ? pushes[0].modified : 0
        }
    })
})

var needsNotifying = function(push) {
    if (push.dismissed) {
        if (push.awake_app_guids && push.direction == 'incoming' && push.awake_app_guids.indexOf('extension-' + localStorage.client_id) != -1) {
            if (Date.now() - (push.created * 1000) > 5 * 60 * 1000) {
                delete push.awake_app_guids
                return
            } else if (!push.channel_iden) {
                var chatTabInfo = pb.findChat(push.sender_email_normalized)
                if (chatTabInfo && chatTabInfo.focused) {
                    delete push.awake_app_guids
                    return
                }
            }
        } else {
            return
        }
    } else if (push.source_device_iden && !push.target_device_iden && push.source_device_iden == pb.local.device.iden) {
        pb.log('To "All devices" from this device, not notifying')
        return
    } else if (push.target_device_iden && pb.local.device && push.target_device_iden != pb.local.device.iden) {
        return
    } else if (push.receiver_iden != pb.local.user.iden && !push.channel_iden && !push.client_iden) {
        return
    } else if (Date.now() - (push.created * 1000) > 48 * 60 * 60 * 1000) {
        pb.log('Push created >48 hours ago, marking dismissed locally')
        push.dismissed = true
        delete push.awake_app_guids
        return
    }

    return push
}

var groupify = function(pushes) {
    var groups = { }
    pushes.map(function(push) {
        var key = pb.groupKey(push)
        var group = groups[key]
        if (!group) {
            group = []
            groups[key] = group
        }
        group.push(push)
    })

    return groups
}

pb.groupKey = function(push) {
    return fromSomeoneElse(push) ? push.channel_iden || push.client_iden || push.sender_email_normalized || push.iden
                                   : push.iden
}

var fromSomeoneElse = function(push) {
    return push.direction == 'incoming' || push.client_iden || push.sender_iden != pb.local.user.iden
}

var updateNotifications = function(groups) {
    var uniqueGroupKeys = {}
    Object.keys(pb.visibleGroups).concat(Object.keys(groups)).forEach(function(key) {
        uniqueGroupKeys[key] = true
    })

    var groupKeys = Object.keys(uniqueGroupKeys)
    groupKeys.forEach(function(key) {
        var desired = groups[key]
        var visible = pb.visibleGroups[key]

        var existingOptions = pb.notifier.active[key]

        if (!desired || desired.length == 0) {
            if (existingOptions) {
                // Remove onclose, we're just syncing the dismissal
                existingOptions.onclose = null
                delete pb.visibleGroups[key]
            }

            pb.notifier.dismiss(key)
            return
        }

        var firstPush = desired[0]

        var options = {
            'key': key,
            'buttons': []
        }

        if (visible && visible.length >= desired.length) {
            options.collapse = true
        }

        var party = fromSomeoneElse(firstPush) ? findParty(firstPush) : null
        if (party && party.muted) {
            pb.notifier.dismiss(key)
            return
        }

        var partyName = party ? party.name : chrome.i18n.getMessage('me')

        if (desired.length == 1) {
            options.type = 'basic'
            options.title = firstPush.title || partyName
            options.message = firstPush.body || firstPush.file_name || firstPush.url

            if (firstPush.image_url) {
                if (!pb.settings.onlyShowTitles) {
                    options.type = 'image'
                    if (firstPush.image_url.indexOf('ggpht') != -1 || firstPush.image_url.indexOf('googleusercontent') != -1) {
                        options.imageUrl = firstPush.image_url + '=s' + 360
                    } else {
                        options.imageUrl = firstPush.image_url
                    }
                }
            }

            if (party && !party.tag && firstPush.url) {
                options.buttons.push({
                    'title': chrome.i18n.getMessage('go_to_link'),
                    'iconUrl': 'action_web.png',
                    'onclick': function() {
                        pb.openTab(firstPush.url)
                    }
                })
            }
        } else {
            options.type = 'list'
            options.title = partyName || chrome.i18n.getMessage('num_new_messages', [desired.length])

            options.items = []
            desired.forEach(function(push) {
                var title = push.title || push.file_name || ''
                var body
                if (title) {
                    body = push.body || ''
                } else {
                    title = push.body || ''
                    body = ''
                }

                options.items.push({
                    'title': title,
                    'message': body
                })
            })
        }

        if (party) {
            options.iconUrl = party.image_url
            try {
                options.contextMessage = chrome.i18n.getMessage('push_context_message', [party.name, new Date(Math.floor(firstPush.created * 1000)).toLocaleTimeString().replace(/:\d+ /, ' ')])
            } catch (e) {
                options.contextMessage = party.name
            }
        }

        if (!options.iconUrl) {
            if (party && party.email) {
                options.iconUrl = 'chip_person.png'
            } else if (party && party.tag) {
                options.iconUrl = 'chip_channel.png'
            } else if (firstPush.source_device_iden) {
                var device = pb.local.devices[firstPush.source_device_iden]
                if (device) {
                    options.iconUrl = utils.streamImageUrl(device)
                }
            } else {
                options.iconUrl = 'icon_48.png'
            }
        }

        options.onclick = function() {
            // Deal with clicks on incoming pushes from other people by opening a chat window
            if (firstPush.direction == 'incoming' && party && party.email_normalized) {
                pb.openChat('push', party.email_normalized)
                return
            }

            var openWebsite = function() {
                var url
                if (party) {
                    if (party.email_normalized) {
                        url = pb.www + '/#people/' + party.email_normalized
                    } else if (party.tag) {
                        url = pb.www + '/#following/' + party.tag
                    } else {
                        url = pb.www
                    }
                } else {
                    url = pb.www
                }

                pb.openTab(url)
            }

            if (desired.length == 1) {
                if (firstPush.type == 'link') {
                    pb.openTab(firstPush.url)
                } else if (firstPush.type == 'file') {
                    pb.openTab(firstPush.file_url)
                } else {
                    openWebsite()
                }
            } else {
                openWebsite()
            }
        }

        options.onclose = function() {
            delete pb.visibleGroups[key]

            desired.filter(function(push) {
                delete push.awake_app_guids

                if (!push.dismissed) {
                    push.dismissed = true
                    return push
                }
            }).forEach(function(push) {
                pb.markDismissed(push)
            })

            pb.savePushes()
        }

        if (firstPush.channel_iden) {
            utils.asArray(pb.local.subscriptions).forEach(function(subscription) {
                if (subscription.channel.iden == firstPush.channel_iden) {
                    options.buttons.push({
                        'title': chrome.i18n.getMessage('unsubscribe_from_channel', [subscription.channel.name]),
                        'iconUrl': 'action_halt.png',
                        'onclick': function() {
                            pb.track({
                                'name': 'unsubscribe',
                                'channel_tag': subscription.channel.tag
                            })

                            var undo = {
                                'type': 'basic',
                                'key': options.key,
                                'title': chrome.i18n.getMessage('unsubscribed_from_channel', [subscription.channel.name]),
                                'message': '',
                                'iconUrl': options.iconUrl
                            }

                            undo.buttons = [{
                                'title': chrome.i18n.getMessage('undo'),
                                'iconUrl': 'action_undo.png',
                                'onclick': function() {
                                    delete undo.onclose
                                }
                            }]

                            undo.buttons.push({
                                'title': chrome.i18n.getMessage('done'),
                                'iconUrl': 'action_tick.png',
                                'onclick': function() {
                                }
                            })

                            undo.onclose = function() {
                                pb.del(pb.api + '/v2/subscriptions/' + subscription.iden, function(response) {
                                    if (response) {
                                        pb.log('Unsubscribed from ' + subscription.channel.name)
                                    } else {
                                        pb.log('Failed to unsubscribe from ' + subscription.channel.name)
                                    }
                                })
                            }

                            setTimeout(function() {
                                pb.notifier.show(undo)
                            }, 0)

                            setTimeout(function() {
                                pb.notifier.dismiss(undo.key)
                            }, 5000)
                        }
                    })
                }
            })
        }

        options.buttons.push({
            'title': chrome.i18n.getMessage('dismiss'),
            'iconUrl': 'action_cancel.png',
            'onclick': function() {
            }
        })

        pb.log('Notifying for group ' + key)
        pb.log(desired)

        var toThisDevice = pb.local.device && firstPush.target_device_iden == pb.local.device.iden

        if (toThisDevice) {
            if (!fromSomeoneElse(firstPush) && pb.settings.openMyLinksAutomatically) {
                options.onclose()
                setTimeout(function() { // Let other Chromes open? Blah
                    options.onclick()
                }, 1000)
            } else {
                pb.notifier.show(options)
            }
        } else {
            var overrideDesktop = !!pb.findChat(firstPush.sender_email_normalized)
            if (overrideDesktop) {
                pb.notifier.show(options)
            } else {
                utils.checkNativeClient(function(response) {
                    if (!response) {
                        pb.notifier.show(options)
                    }
                })
            }
        }
    })

    pb.visibleGroups = groups
}

var findParty = function(push) {
    var match

    if (push.channel_iden) {
        utils.asArray(pb.local.subscriptions).map(function(subscription) {
            if (push.channel_iden == subscription.channel.iden) {
                match = subscription.channel
            }
        })
    } else if (push.client_iden) {
        utils.asArray(pb.local.grants).map(function(grant) {
            if (push.client_iden == grant.client.iden) {
                match = grant.client
            }
        })
    } else {
        utils.asArray(pb.local.chats).map(function(chat) {
            if (push.sender_email_normalized == chat.with.email_normalized) {
                match = chat.with
            }
        })
    }

    return match
}

pb.markDismissed = function(push) {
    delete push.awake_app_guids

    pb.post(pb.api + '/v2/pushes/' + push.iden, {
        'dismissed': true
    }, function(response) {
            if (response) {
                pb.log('Marked push ' + push.iden + ' dismissed')
            } else {
                pb.log('Failed to mark push ' + push.iden + 'dismissed, server returned ' + status)
            }
        }
    )
}
