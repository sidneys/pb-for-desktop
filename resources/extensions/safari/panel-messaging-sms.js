'use strict';

if (!self.port && !window.chrome && !window.safari) {
    throw new Error('Shouldn\'t be here');
}

var smsDevices, smsDeviceInput, threadsHolder, smsInput, updateSmsChatInterval;
var postedSms = {};

var setUpSmsMessaging = function() {
    setUpInput();
    setUpSmsDevicePicker();

    pb.addEventListener('sms_changed', smsChangedListener);
    pb.addEventListener('locals_changed', smsLocalsChangedListener);
    pb.addEventListener('sms_send_failed', smsSendFailedListener);

    var smsPickerHolder = document.getElementById('sms-picker-holder');
    var smsDisclaimer = document.getElementById('sms-disclaimer-tooltip');
    smsPickerHolder.onmouseenter = function() {
        smsDisclaimer.style.display = 'block';
    };

    smsPickerHolder.onmouseleave = function() {
        smsDisclaimer.style.display = 'none';
    };

    clearInterval(updateSmsChatInterval);
    updateSmsChatInterval = setInterval(function() {
        if (window && smsInput && smsInput.thread && smsInput.messages) {
            smsLocalsChangedListener();
        }
    }, 60 * 1000);
};

var tearDownSmsMessaging = function() {
    if (smsDeviceInput) {
        delete smsDeviceInput.target;
    }

    clearInterval(updateSmsChatInterval);
    delete document.getElementById('sms-input').thread;

    pb.removeEventListener('sms_changed', smsChangedListener);
    pb.removeEventListener('locals_changed', smsLocalsChangedListener);
    pb.removeEventListener('sms_send_failed', smsSendFailedListener);

    if (threadsHolder) {
        while (threadsHolder.hasChildNodes()) {
            threadsHolder.removeChild(threadsHolder.lastChild);
        }
    }

    var chatCell = document.getElementById('sms-chat-cell');
    while (chatCell.hasChildNodes()) {
        chatCell.removeChild(chatCell.lastChild);
    }

    updateActiveSmsChat();

    var banner = document.getElementById('messaging-banner');
    while (banner.hasChildNodes()) {
        banner.removeChild(banner.lastChild);
    }
    banner.style.display = 'none';
};

var setUpSmsDevicePicker = function() {
    smsDevices = Object.keys(pb.local.devices).map(function(key) {
        return pb.local.devices[key];
    }).filter(function(device) {
        return device.has_sms;
    }).sort(function(a, b) {
        return a.created - b.created;
    });

    var pickerHolder = document.createElement('div');
    pickerHolder.id = 'sms-picker-holder';

    var pickerLabel = document.createElement('div');
    pickerLabel.className = 'picker-label';
    pickerLabel.textContent = text.get('phone');

    var div = document.createElement('div');
    div.style.overflow = 'hidden';
    div.style.position = 'relative';

    smsDeviceInput = document.createElement('input');
    smsDeviceInput.id = 'sms-device';
    smsDeviceInput.type = 'text';

    var smsDeviceOverlay = document.createElement('div');
    smsDeviceOverlay.id = 'sms-device-overlay';
    smsDeviceOverlay.className = 'picker-overlay';

    div.appendChild(smsDeviceInput);
    div.appendChild(smsDeviceOverlay);

    var smsDevicePicker = document.createElement('div');
    smsDevicePicker.id = 'sms-device-picker';
    smsDevicePicker.className = 'picker';

    pickerHolder.appendChild(pickerLabel);
    pickerHolder.appendChild(div);
    pickerHolder.appendChild(smsDevicePicker);

    messagingLeft.appendChild(pickerHolder);

    threadsHolder = document.createElement('div');
    messagingLeft.appendChild(threadsHolder);

    picker.setUp({
        'inputId': 'sms-device',
        'pickerId': 'sms-device-picker',
        'overlayId': 'sms-device-overlay',
        'targets': smsDevices,
        'onselect': function(device) {
            while (threadsHolder.hasChildNodes()) {
                threadsHolder.removeChild(threadsHolder.lastChild);
            }

            smsChangedListener();
        }
    });
};

var smsChangedListener = function() {
    var device = smsDeviceInput.target;
    if (device) {
        pb.getThreads(device.iden, function(response) {
            if (device == smsDeviceInput.target) {
                if (response) {
                    setUpThreads(response.threads);
                } else {
                    setUpThreads();
                }
            }
        });
    }
};

var smsLocalsChangedListener = function() {
    if (!smsInput.thread || !smsInput.messages) {
        return;
    }

    if (Object.keys(postedSms).length > 0) {
        smsInput.messages.forEach(function(message) {
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
        return sms.thread_id == smsInput.thread.id;
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

    var messages = smsInput.messages.concat(postedToConcat).concat(pb.smsQueue.filter(function(sms) {
        return sms.thread_id == smsInput.thread.id && !postedSms[sms.guid];
    }).map(function(sms) {
        return {
            'body': sms.body,
            'direction': 'outgoing',
            'status': 'queued',
            'type': 'sms'
        };
    }));

    updateSmsChat(smsInput.thread, messages);

    var banner = document.getElementById('messaging-banner');
    while (banner.hasChildNodes()) {
        banner.removeChild(banner.lastChild);
    }

    if (!pb.local.user.pro && pb.local.user.reply_count_quota) {
        banner.style.display = 'block';

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
    } else {
        banner.style.display = 'none';
    }
};

var smsSendFailedListener = function(e) {
    markSmsFailed(e.detail.guid, false, e.detail.dontTrack);
};

var markSmsFailed = function(guid, timeout, dontTrack) {
    var sms = postedSms[guid];
    if (sms) {
        sms.status = 'failed';
        smsLocalsChangedListener();

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

var setUpInput = function() {
    smsInput = document.getElementById('sms-input');
    var sendIcon = document.getElementById('sms-send-icon');

    smsInput.placeholder = text.get('message_placeholder');

    var sendClicked = function() {
        smsInput.focus();

        if (!smsInput.value) {
            return;
        }

        var addresses = smsInput.thread.recipients.map(function(recipient) {
            return recipient.address;
        });

        var sms = pb.sendSms(smsDeviceInput.target.iden, smsInput.thread.id, addresses, smsInput.value);
        sms.timestamp = Date.now();
        postedSms[sms.guid] = sms;

        smsInput.value = '';

        pb.track({
            'name': 'sms_send',
            'thread': true,
            'window': location.hash ? 'popout' : 'panel',
            'address_count': addresses.length
        });
    };

    document.getElementById('sms-send-holder').onclick = function() {
        sendClicked();
    };

    smsInput.onkeydown = function(e) {
        if (e.keyCode == utils.ENTER && !e.shiftKey) {
            sendClicked();
            return false;
        }
    };
};

var setUpThreads = function(threads) {
    while (threadsHolder.hasChildNodes()) {
        threadsHolder.removeChild(threadsHolder.lastChild);
    }

    if (!pb.local.user) {
        return;
    }

    var fragment = document.createDocumentFragment();

    var composeRow = newSmsRow();
    fragment.appendChild(composeRow);

    var selectedThread;
    if (threads) {
        threads.forEach(function(thread) {
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

            var onPopOutClick = function(e) {
                e.stopPropagation();
                pb.openChat('sms', smsDeviceInput.target.iden + '_thread_' + thread.id);
            };

            var row = createStreamRow(imageUrl, name, thread.latest && thread.latest.body, null, onPopOutClick);
            row.id = thread.id;
            row.onclick = function() {
                selectThread(thread);
            };

            if (thread.id == localStorage['lastTheadId_' + smsDeviceInput.target.iden]) {
                selectedThread = thread;
            }

            fragment.appendChild(row);
        });
    }

    threadsHolder.appendChild(fragment);

    if (selectedThread) {
        selectThread(selectedThread);
    } else if (threads && threads.length > 0 && document.getElementById('sms-compose-right').style.display != 'block') {
        selectThread(threads[0]);
    } else {
        selectCompose(composeRow);
    }
};

var newSmsRow = function() {
    var row = createStreamRow('chip_add.png', text.get('new_sms_thread'));
    row.id = 'new_sms';
    row.onclick = function() {
        selectCompose(row);
    };

    return row;
};

var selectThread = function(thread) {
    if (!thread) {
        return;
    }

    clearSelectedStream();

    var row = document.getElementById(thread.id);
    if (row) {
        row.classList.add('selected');
    }

    var previousThread = smsInput.thread;
    if (!previousThread) {
        scrollStreamRowIntoViewIfNecessary(row);
    }

    
    localStorage['lastTheadId_' + smsDeviceInput.target.iden] = thread.id;
    delete smsInput.messages;
    smsInput.thread = thread;
    updateActiveSmsChat();

    document.getElementById('sms-compose-right').style.display = 'none';
    document.getElementById('sms-right').style.display = 'block';

    if (thread.recipients.length == 1 || smsDeviceInput.target.has_mms) {
        document.getElementById('sms-right-top').classList.add('with-input');
        document.getElementById('sms-right-bottom').style.display = 'block';
    } else {
        document.getElementById('sms-right-top').classList.remove('with-input');
        document.getElementById('sms-right-bottom').style.display = 'none';
    }

    if (previousThread && previousThread.id != thread.id) {
        updateSmsChat();
    }

    pb.getThread(smsDeviceInput.target.iden, thread.id, function(response) {
        if (thread == smsInput.thread) {
            if (response) {
                var messages = response.thread;
                smsInput.messages = messages;
                smsInput.focus();

                smsLocalsChangedListener();
            }
        }
    });
};

var selectCompose = function(row) {
    clearSelectedStream();
    delete smsInput.messages;
    delete smsInput.thread;
    row.classList.add('selected');
    updateActiveSmsChat();
    updateSmsChat();

    document.getElementById('sms-compose-right').style.display = 'block';
    document.getElementById('sms-right').style.display = 'none';

    var banner = document.getElementById('messaging-banner');
    if (banner.hasChildNodes()) {
        document.getElementById('sms-compose-right').style.marginTop = '56px';
    } else {
        document.getElementById('sms-compose-right').style.marginTop = '0';
    }

    var composeInput = document.getElementById('compose-message');
    composeInput.placeholder = text.get('message_placeholder');
    composeInput.focus();

    composeInput.onkeydown = function(e) {
        if (e.keyCode == utils.ENTER && !e.shiftKey) {
            smsSendButton.onclick();
            return false;
        }
    };

    var recipient = document.getElementById('compose-recipient');
    recipient.placeholder = text.get('sms_recipient_placeholder');

    var smsSendButton = document.getElementById('compose-send-holder');
    smsSendButton.onclick = function() {
        composeInput.focus();

        if (!composeInput.value) {
            return;
        }

        if (!recipient.target && !recipient.value) {
            return;
        }

        var addresses = [];
        addresses.push((recipient.target && recipient.target.phone) || recipient.value);

        pb.sendSms(smsDeviceInput.target.iden, 'new', addresses, composeInput.value);

        composeInput.value = '';

        pb.track({
            'name': 'sms_send',
            'thread': false
        });
    };

    pb.getPhonebook(smsDeviceInput.target.iden, function(data) {
        if (data) {
            var phonebook = data.phonebook.sort(function(a, b) {
                try {
                    var an = a.name.toLowerCase();
                    var bn = b.name.toLowerCase();
                    if (an > bn) {
                        return 1;
                    } else if (an < bn) {
                        return -1;
                    }
                } catch (e) { }
                return 0;
            });

            picker.setUp({
                'inputId': 'compose-recipient',
                'pickerId': 'compose-recipient-picker',
                'overlayId': 'compose-recipient-overlay',
                'targets': phonebook,
                'noDefault': true,
                'onselect': function(target) {
                    setTimeout(function() {
                        composeInput.focus();
                    }, 100);
                }
            });
        }
    });
};

var updateActiveSmsChat = function() {
    var thread = document.getElementById('sms-input').thread;
    if (thread && smsDeviceInput) {
        pb.setActiveChat(tabId, {
            'mode': 'sms',
            'other': smsDeviceInput.target.iden + '_thread_' + thread.id,
            'focused': focused
        });
    } else {
        pb.clearActiveChat(tabId);
    }
};
