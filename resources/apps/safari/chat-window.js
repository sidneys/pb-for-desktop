'use strict';

var guid, mode, tabId;
var postedSms = {};

window.init = function() {
    var params = utils.getParams(location.search);
    guid = params['guid'];
    mode = params['mode'];

    if (window.chrome) {
        chrome.runtime.sendMessage({
            'type': 'loopback'
        }, function(response) {
            tabId = response.tabId;
            setUp();
        });
    } else if (self.port) {
        tabId = guid;
        setUp();
    }
};

onFocusChanged = function() {
    if (tabId) {
        updateActiveChat();
    }

    if (focused) {
        localsChangedListener();
        document.getElementById('input').focus();
    }
};

var setUp = function() {
    setUpInput();

    if (mode == 'sms') {
        document.getElementById('sms-chat-scroll').style.display = 'block';

        pb.addEventListener('sms_changed', smsChangedListener);
        pb.addEventListener('sms_send_failed', smsSendFailedListener);

        smsChangedListener();
    } else {
        document.getElementById('push-chat-scroll').style.display = 'block';
        document.getElementById('picker-holder').style.display = 'block';

        setUpDropZone('container', 'chat-drop-zone', function(file) {
            var target = document.getElementById('input').target;
            if (!target) {
                return;
            }

            var push = {
                'email': target.with.email_normalized,
                'file': file
            };

            pb.sendPush(push);
        });

        setUpPushPicker();
    }

    pb.addEventListener('locals_changed', localsChangedListener);

    monitorAwake();

    setInterval(function() {
        if (window) {
            localsChangedListener();
        }
    }, 60 * 1000);

    var onunload = function() {
        pb.removeEventListener('locals_changed', localsChangedListener);
        pb.removeEventListener('sms_changed', smsChangedListener);
        pb.removeEventListener('sms_send_failed', smsSendFailedListener);
        pb.setAwake(guid, false);
        pb.clearActiveChat(tabId);
    };

    window.addEventListener('unload', onunload);
};

var localsChangedListener = function(e) {
    if (!window) {
        return;
    }

    if (!pb.local.user) {
        window.close();
        return;
    }

    var input = document.getElementById('input');
    if (mode == 'sms') {
        if (thread && input.messages) {
            if (Object.keys(postedSms).length > 0) {
                input.messages.forEach(function(message) {
                    Object.keys(postedSms).forEach(function(key) {
                        var posted = postedSms[key];
                        if (posted && message.guid == posted.guid) {
                            delete postedSms[key];
                        } else if (Date.now() - posted.timestamp > 30000 && posted.status != 'failed') {
                            markSmsFailed(key, true);
                        }
                    });
                });
            }

            var postedToConcat = Object.keys(postedSms).map(function(key) {
                return postedSms[key];  
            }).filter(function(sms) {
                return sms.thread_id == thread.id;
            }).map(function(sms) {
                return {
                    'body': sms.body,
                    'direction': 'outgoing',
                    'status': sms.status || 'queued',
                    'type': 'sms',
                    'device_iden': sms.device_iden,
                    'thread_id': sms.thread_id,
                    'addresses': sms.addresses,
                    'guid': sms.guid
                };
            });

            var messages = input.messages.concat(postedToConcat).concat(pb.smsQueue.filter(function(sms) {
                return sms.thread_id == thread.id && !postedSms[sms.guid];
            }).map(function(sms) {
                return {
                    'body': sms.body,
                    'direction': 'outgoing',
                    'status': 'queued',
                    'type': 'sms'
                };
            }));

            updateSmsChat(thread, messages);
        }
    } else if (input.target) {
        updatePushChat(input.target);
    }
};

var thread, device;
var smsChangedListener = function(e) {
    if (!window) {
        return;
    }

    if (!thread) {
        var parts = location.hash.substring(1).split('_thread_');
        device = pb.local.devices[parts[0]];
        pb.getThreads(parts[0], function(response) {
            if (response) {
                response.threads.forEach(function(t) {
                    if (t.id == parts[1]) {
                        thread = t;

                        var name, imageUrl;
                        if (thread.recipients.length == 1) {
                            var recipient = thread.recipients[0];
                            name = recipient.name;

                            if (recipient.image_url) {
                                imageUrl = recipient.image_url;
                            } else if (recipient.thumbnail) {
                                imageUrl = 'data:image/jpeg;base64,' + recipient.thumbnail;
                            } else {
                                imageUrl = 'chip_person.png';
                            }
                        } else {
                            name = thread.recipients.map(function(recipient) { return recipient.name; }).join(', ');
                            imageUrl = 'chip_group.png';
                        }

                        document.getElementById('sms-top').style.display = 'block';
                        document.getElementById('sms-thumbnail').src = imageUrl;
                        document.getElementById('sms-name').textContent = name;

                        return;
                    }
                });
                updateThread();
            }
        });
    } else {
        updateThread();
    }
};

var smsSendFailedListener = function(e) {
    markSmsFailed(e.detail.guid, false, e.detail.dontTrack);
};

var markSmsFailed = function(guid, timeout, dontTrack) {
    var sms = postedSms[guid];
    if (sms) {
        sms.status = 'failed';
        localsChangedListener();

        if (!dontTrack) {
            var e = {
                'name': 'sms_send_failed'
            };

            if (timeout) {
                var device = pb.local.devices[sms.device_iden];
                if (device) {
                    e['push_token'] = device.push_token;
                }
            }

            pb.track(e);
        }
    }
};

var updateThread = function() {
    if (thread) {
        if (thread.recipients.length != 1 && !device.has_mms) {
            document.getElementById('bottom').style.display = 'none';
            document.getElementById('chat-holder').style.bottom = '0';
        }

        pb.getThread(device.iden, thread.id, function(response) {
            if (response) {
                document.getElementById('input').focus();
                var messages = response.thread;
                document.getElementById('input').messages = messages;
                localsChangedListener();
            }
        });

        var banner = document.getElementById('messaging-banner');
        while (banner.hasChildNodes()) {
            banner.removeChild(banner.lastChild);
        }

        if (!pb.local.user.pro && pb.local.user.reply_count_quota) {
            var span = document.createElement('span');

            var link = document.createElement('span');
            link.textContent = text.get('reply_limit_upgrade');
            link.style.textDecoration = 'underline';
            link.style.cursor = 'pointer';

            if (pb.local.user.reply_count_quota == 'over_limit') {
                banner.style.backgroundColor = '#e85845';
                banner.style.color = 'white';
                span.textContent = text.get('reply_limit_reached') + ' ';

                link.onclick = function() {
                    pb.openTab(pb.www + '/pro');
                    pb.track({
                        'name': 'go_upgrade',
                        'source': 'sms_limit'
                    });
                };
            } else {
                banner.style.backgroundColor = '#ecf0f0';
                banner.style.color = 'inherit';
                span.textContent = text.get('reply_limit_warning') + ' ';

                link.onclick = function() {
                    pb.openTab(pb.www + '/pro');
                    pb.track({
                        'name': 'go_upgrade',
                        'source': 'sms_warning'
                    });
                };
            }

            banner.appendChild(span);
            banner.appendChild(link);
        }
    }
};

var setUpPushPicker = function() {
    var input = document.getElementById('input');

    var chats = utils.asArray(pb.local.chats);
    utils.alphabetizeChats(chats);

    var spec = {
        'inputId': 'chat-target',
        'pickerId': 'chat-picker',
        'overlayId': 'chat-overlay',
        'targets': chats,
        'onselect': function(target) {
            location.hash = target.with.email_normalized;
            input.target = target;
            input.value = '';
            input.focus();
            updateActiveChat();
            updatePushChat(target);
            scrollPushChat();
        }
    };

    if (location.hash) {
        // Update selected to match the hash
        var email = location.hash.substring(1);
        spec.selectedKey = email;
    }

    picker.setUp(spec);
};

var setUpInput = function() {
    var input = document.getElementById('input');
    input.placeholder = text.get(mode == 'sms' ? 'message_placeholder' : 'message_placeholder_files');

    input.addEventListener('input', function(e) {
        reportAwake();
    });

    input.onkeydown = function(e) {
        if (e.keyCode == utils.ENTER && !e.shiftKey) {
            if (!input.value) {
                return false;
            }

            if (mode == 'sms') {
                var addresses = thread.recipients.map(function(recipient) {
                    return recipient.address;
                });

                var sms = pb.sendSms(device.iden, thread.id, addresses, input.value);
                sms.timestamp = Date.now();
                postedSms[sms.guid] = sms;
                scrollSmsChat();

                pb.track({
                    'name': 'sms_send',
                    'thread': true,
                    'window': 'chat',
                    'address_count': addresses.length
                });
            } else {
                if (!input.target) {
                    return false;
                }

                var push = {
                    'email': input.target.with.email_normalized
                };

                if (input.value) {
                    if (utils.isLink(input.value)) {
                        push.type = 'link';
                        push.url = input.value;
                    } else {
                        push.type = 'note';
                        push.body = input.value;
                    }
                }

                pb.sendPush(push);
                scrollPushChat();
            }

            input.value = '';

            reportAwake();

            return false;
        }
    };

    input.focus();
};

var updateActiveChat = function() {
    pb.setActiveChat(tabId, {
        'mode': mode,
        'other': location.hash.substring(1),
        'focused': focused
    });
};

var monitorAwake = function() {
    pb.setAwake(guid, true);

    document.body.onmousemove = function(e) {
        if (window.mouseLastX !== e.clientX || window.mouseLastY !== e.clientY) {
            reportAwake();
        }

        window.mouseLastX = e.clientX;
        window.mouseLastY = e.clientY;
    };
};

var lastReportedAwake = Date.now();
var reportAwake = function() {
    if (Date.now() - lastReportedAwake > 10 * 1000) {
        lastReportedAwake = Date.now();
        pb.setAwake(guid, true);
    }
};
