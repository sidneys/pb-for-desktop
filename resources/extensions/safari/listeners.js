'use strict';

pb.addEventListener('signed_in', function(e) {
    pb.addEventListener('active', function(e) {
        if (pb.local.user) {
            pb.trackPerHour({
                'name': 'active'
            });
        }
    });
});

pb.browserState = 'active';

if (window.chrome) {
    chrome.idle.onStateChanged.addListener(function(newState) {
        pb.devtools('Chrome state changed to ' + newState);
        pb.browserState = newState;

        if (newState == 'locked') {
            pb.fallAsleep();
        }
    });

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.type == 'loopback') {
            sendResponse({
                'tabId': sender.tab.id
            });
        }
    });
} else if (window.safari) {
    safari.application.addEventListener('popover', function(e) {
        if (e.target.identifier !== 'toolbar-button') {
            e.target.contentWindow.location.reload();
        }
    }, false);

    safari.application.addEventListener('message', function(e) {
        if (e.name == 'api_key') {
            var apiKey = e.message.apiKey;
            if (!localStorage.apiKey && validApiKey(apiKey)) {
                localStorage.apiKey = apiKey;
            }
        } else if (e.name == 'track') {
            pb.track(e.message);
        } else if (e.name == 'event') {
            pb.dispatchEvent(e.message);
        } else if (e.name == 'open_tab') {
            pb.openTab(e.message.url);
        } else if (e.name == 'send_reply') {
            pb.sendReply(e.message.mirror, e.message.reply);
        } else if (e.name == 'get_locals') {
            e.target.page.dispatchMessage('locals', getLocalsPayload());
        } else if (e.name == 'set_settings') {
            pb.settings = e.message;
            pb.saveSettings();
            pb.loadSettings();
        } else if (e.name = 'set_e2e_password') {
            pb.e2e.setPassword(e.message);
        }
    }, false);
} else {
    var emitLocals = function() {
        self.port.emit('locals', getLocalsPayload());
    };

    var emitNotifications = function() {
        self.port.emit('notifications', pb.notifier.active);
    };

    self.port.on('track', function(event) {
        pb.track(event);
    });

    self.port.on('event', function(event) {
        pb.dispatchEvent(event);
    });

    self.port.on('sign_out', function() {
        pb.signOut();
    });

    self.port.on('send_push', function(push) {
        pb.sendPush(push);
    });

    self.port.on('send_sms', function(spec) {
        pb.sendSms(spec.device_iden, spec.thread_id, spec.address, spec.body, spec.guid);
    });

    self.port.on('send_reply', function(spec) {
        pb.sendReply(spec.mirror, spec.reply);
    });

    self.port.on('set_settings', function(settings) {
        pb.settings = settings;
        pb.saveSettings();
        pb.loadSettings();
    });

    self.port.on('set_e2e_password', function(password) {
        pb.e2e.setPassword(password);
    });

    self.port.on('get_locals', function() {
        emitLocals();
    });

    self.port.on('get_notifications', function() {
        emitNotifications();
    });

    self.port.on('notification_clicked', function(key) {
        var options = pb.notifier.active[key];
        if (options.onclick) {
            options.onclick();
        }
        pb.notifier.dismiss(key);
    });

    self.port.on('notification_button_clicked', function(spec) {
        var options = pb.notifier.active[spec.key];
        options.allButtons.map(function(button) {
            if (button.title == spec.title) {
                button.onclick();
            }
        });
    });

    self.port.on('notification_closed', function(key) {
        pb.notifier.dismiss(key);
    });

    self.port.on('get_threads', function(deviceIden) {
        pb.getThreads(deviceIden, function(response) {
            self.port.emit('threads', response);
        });
    });

    self.port.on('get_thread', function(spec) {
        pb.getThread(spec.deviceIden, spec.threadId, function(response) {
            self.port.emit('thread', response);
        });
    });

    self.port.on('set_awake', function(spec) {
        pb.setAwake(spec.reason, spec.awake);
    });

    self.port.on('open_chat', function(spec) {
        pb.openChat(spec.mode, spec.other);
    });

    self.port.on('set_active_chat', function(spec) {
        pb.setActiveChat(spec.tabId, spec.info);
    });

    self.port.on('clear_active_chat', function(tabId) {
        pb.clearActiveChat(tabId);
    });

    self.port.on('mark_dismissed', function(iden) {
        var push = pb.local.pushes[iden];
        if (push) {
            pb.markDismissed(push);
        }
    });

    var clearAwakeAppGuidsTimeout;
    self.port.on('clear_awake_app_guids', function(iden) {
        var push = pb.local.pushes[iden];
        if (push) {
            delete push.awake_app_guids;
            pb.notifier.dismiss(pb.groupKey(push));

            clearTimeout(clearAwakeAppGuidsTimeout);
            clearAwakeAppGuidsTimeout = setTimeout(function() {
                pb.savePushes();
                pb.dispatchEvent('locals_changed');
            }, 500);
        }
    });

    self.port.on('clear_failed_push', function() {
        pb.failedPushes = [];
        pb.dispatchEvent('locals_changed');
    });

    pb.addEventListener('signed_in', function(e) {
        pb.addEventListener('locals_changed', function() {
            emitLocals();
        });

        pb.addEventListener('sms_changed', function() {
            self.port.emit('sms_changed');
        });

        pb.addEventListener('notifications_changed', function() {
            emitNotifications();

            var count = (pb.settings.showNotificationCount && Object.keys(pb.notifier.active).length) || 0;
            self.port.emit('notification_count', count);
        });
    });
}

var getLocalsPayload = function() {
    return {
        'www': pb.www,
        'version': pb.version,
        'api': pb.api,
        'userAgent': pb.userAgent,
        'awake': pb.awake,
        'local': pb.local,
        'pushQueue': pb.pushQueue,
        'fileQueue': pb.fileQueue,
        'failedPushes': pb.failedPushes,
        'successfulPushes': pb.successfulPushes,
        'smsQueue': pb.smsQueue,
        'settings': pb.settings,
        'e2e': {
            'enabled': pb.e2e.enabled,
            'key': pb.e2e.key
        }
    };
};
