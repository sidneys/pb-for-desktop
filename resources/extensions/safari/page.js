'use strict';

if (!self.port && !window.chrome && !window.safari) {
    throw new Error('Shouldn\'t be here');
}

var focused = true, onFocusChanged;
window.addEventListener('focus', function() {
    focused = true;

    if (onFocusChanged) {
        onFocusChanged();
    }

    pb.dispatchEvent('active');
});
window.addEventListener('blur', function() {
    focused = false;

    if (onFocusChanged) {
        onFocusChanged();
    }
});

var onload = function() {
    if (!self.port) {
        onload = null;
    }

    if (window.chrome) {
        window.pb = chrome.extension.getBackgroundPage().pb;
        ready();
    } else if (window.safari) {
        if (safari.extension.globalPage) {
            window.pb = safari.extension.globalPage.contentWindow.pb;
            ready();
        } else {
            window.pb = {};

            var proxy = function(name, data) {
                safari.self.tab.dispatchMessage(name, data);
            };

            pb.sendPush = function(push) {
                proxy('send_push', push);
            };

            var getLocals = function(done) {
                proxy('get_locals');

                var listener = function(e) {
                    done(e.message);
                    safari.self.removeEventListener('message', listener, false);
                };

                safari.self.addEventListener('message', listener, false);
            };

            setUpMessagePassing(proxy, function() {
                getLocals(function(locals) {
                    delete locals.fileQueue;

                    Object.keys(locals).forEach(function(key) {
                        pb[key] = locals[key];
                    });

                    pb.e2e.setPassword = function(password) {
                        proxy('set_e2e_password', password);
                    };

                    ready();
                });
            });
        }
    } else {
        setUpMessagePassing(self.port.emit, function() {
            pb.getActiveTab = function(done) {
                self.port.once('active_tab', function(tab) {
                    done(tab);
                });

                self.port.emit('get_active_tab');
            };

            pb.sendPush = function(push) {
                if (push.file) {
                    pb.pushFile(push);

                    if (self.port) {
                        window.dispatchEvent(new CustomEvent('locals_changed'));
                    }
                } else {
                    self.port.emit('send_push', push);
                }
            };

            pb.clearFailed = function() {
                self.port.emit('clear_failed_push');
            };

            pb.sendSms = function(deviceIden, threadId, address, body) {
                var sms = {
                    'device_iden': deviceIden,
                    'thread_id': threadId,
                    'address': address,
                    'body': body,
                    'guid': utils.guid()
                };

                self.port.emit('send_sms', sms);

                return sms;
            };

            pb.addEventListener = function(eventName, listener) {
                window.addEventListener(eventName, listener, false);
            };

            pb.removeEventListener = function(eventName, listener) {
                window.removeEventListener(eventName, listener);
            };

            pb.markDismissed = function(push) {
                self.port.emit('mark_dismissed', push.iden);
            };

            pb.openChat = function(mode, other) {
                self.port.emit('open_chat', { 'mode': mode, 'other': other });
            };

            pb.getThreads = function(deviceIden, done) {
                self.port.once('threads', function(response) {
                    done(response);
                });

                self.port.emit('get_threads', deviceIden);
            };

            pb.getThread = function(deviceIden, threadId, done) {
                self.port.once('thread', function(response) {
                    done(response);
                });

                self.port.emit('get_thread', { 'deviceIden': deviceIden, 'threadId': threadId });
            };

            pb.popOutPanel = function() {
                self.port.emit('pop_out_panel');
            };

            self.port.once('locals', function() {
                pb.e2e.setPassword = function(password) {
                    self.port.emit('set_e2e_password', password);
                };

                ready();
            });

            self.port.emit('get_locals');
            self.port.emit('get_notifications');
        });
    }
};

var ready = function() {
    addBodyCssClasses();

    window.init();

    pb.dispatchEvent('active');
};

var setUpMessagePassing = function(dispatcher, done) {
    pb.devtools = function(message) {
        console.devtools(message);
    };

    pb.dispatchEvent = function(name) {
        dispatcher('event', name);
    };

    pb.track = function(event) {
        dispatcher('track', event);
    };

    pb.signOut = function() {
        dispatcher('sign_out');
    };

    pb.openTab = function(url) {
        dispatcher('open_tab', { 'url': url });
    };

    pb.setAwake = function(reason, awake) {
        dispatcher('set_awake', { 'reason': reason, 'awake': awake });
    };

    pb.setActiveChat = function(tabId, info) {
        dispatcher('set_active_chat', { 'tabId': tabId, 'info': info });
    };

    pb.clearActiveChat = function(tabId) {
        dispatcher('clear_active_chat', tabId);
    };

    pb.sendReply = function(mirror, reply) {
        dispatcher('send_reply', {
            'mirror': mirror,
            'reply': reply
        });
    };

    pb.setSettings = function(settings) {
        dispatcher('set_settings', settings);
    };

    done();
};

var addBodyCssClasses = function() {
    var setClassDisplay = function(className, display) {
        var elements = document.getElementsByClassName(className);
        for (var i = 0; i < elements.length; i++) {
            elements[i].style.display = display;
        }
    };

    if (pb.local && pb.local.user) {
        if (self.port) { // Firefox not() css doens't work when changed on the fly
            setClassDisplay('not-signed-in', 'none');
            setClassDisplay('signed-in', 'block');
        } else {
            document.body.classList.add('signed-in');
        }
    } else {
        if (self.port) {
            setClassDisplay('signed-in', 'none');
            setClassDisplay('not-signed-in', 'block');
        } else {
            document.body.classList.add('not-signed-in');
        }
    }

    if (window.chrome) {
        document.body.classList.add('chrome');
    } else {
        document.body.classList.add('not-chrome');
    }

    if (!window.chrome || (window.chrome && !pb.isOpera)) {
        document.body.classList.add('not-opera');
    }

    if (window.safari) {
        document.body.classList.add('safari');
    } else {
        document.body.classList.add('not-safari');
    }

    if (!window.chrome && !window.safari) {
        document.body.classList.add('firefox');
    } else {
        document.body.classList.add('not-firefox');
    }

    if (navigator.platform.indexOf('MacIntel') != -1) {
        document.body.classList.add('mac');
    } else {
        document.body.classList.add('not-mac');
    }

    if (navigator.platform.toLowerCase().indexOf('win') != -1) {
        document.body.classList.add('windows');
    } else {
        document.body.classList.add('not-windows');
    }
};

if (window.chrome || window.safari) {
    document.addEventListener('DOMContentLoaded', onload);
} else {
    window.pb = {
        'notifier': {
            'active': {}
        }
    };

    self.port.on('shown', function() {
        onload();
    });

    self.port.on('locals', function(locals) {
        delete locals.fileQueue;

        Object.keys(locals).forEach(function(key) {
            pb[key] = locals[key];
        });

        window.dispatchEvent(new CustomEvent('locals_changed'));
    });

    self.port.on('notifications', function(notifications) {
        pb.notifier.active = notifications;

        window.dispatchEvent(new CustomEvent('notifications_changed'));
    });

    self.port.on('sms_changed', function() {
        window.dispatchEvent(new CustomEvent('sms_changed'));
    });
}

window.onerror = function(message, file, line, column, error) {
    pb.track({
        'name': 'error',
        'stack': error ? error.stack : file + ':' + line + ':' + column,
        'message': message
    });
};
