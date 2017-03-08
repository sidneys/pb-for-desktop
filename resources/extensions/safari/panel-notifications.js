'use strict';

if (!self.port && !window.chrome && !window.safari) {
    throw new Error('Shouldn\'t be here');
}

var setUpNotificationsContent = function() {
    notificationsChangedListener();
    pb.addEventListener('notifications_changed', notificationsChangedListener);
};

var tearDownNotificationsContent = function() {
    pb.removeEventListener('notifications_changed', notificationsChangedListener);
};

var notificationsChangedListener = function() {
    if (!window) {
        return;
    }

    var count = Object.keys(pb.notifier.active).length;
    var tab = document.getElementById('notifications-tab');
    if (count > 0) {
        tab.textContent = text.get('notifications') + ' (' + count + ')';
    } else {
        tab.textContent = text.get('notifications');
    }
    
    updateNotifications();
};

var updateNotifications = function() {
    var notificationsHolder = document.getElementById('notifications-holder');
    var emptyHolder = document.getElementById('notifications-empty');

    while (notificationsHolder.firstChild) {
        notificationsHolder.removeChild(notificationsHolder.firstChild);
    }

    var keys = Object.keys(pb.notifier.active);
    if (keys.length > 0) {
        notificationsHolder.style.display = 'block';
        emptyHolder.style.display = 'none';

        keys.forEach(function(key) {
            var options = pb.notifier.active[key];

            if (self.port) {
                options.onclick = function() {
                    self.port.emit('notification_clicked', key);
                };

                if (options.allButtons) {
                    options.allButtons.forEach(function(button) {
                        button.onclick = function() {
                            self.port.emit('notification_button_clicked', {
                                'key': options.key,
                                'title': button.title
                            });
                        };
                    });
                }
            }

            notificationsHolder.insertBefore(fakeNotifications.renderNotification(options, function() {
                clearNotification(options);
            }), notificationsHolder.firstChild);
        });
    } else {
        notificationsHolder.style.display = 'none';
        emptyHolder.style.display = 'block';
    }
};

var clearNotification = function(options) {
    if (window.chrome) {
        chrome.extension.getBackgroundPage().chrome.notifications.clear(options.key, function(wasCleared) {
            delete pb.notifier.active[options.key];
            pb.dispatchEvent('notifications_changed');
            if (options.onclose) {
                options.onclose();
            }
        });
    } else if (window.safari) {
        options.notification.onclose();
    } else {
        self.port.emit('notification_closed', options.key);
    }
};
