'use strict';

var listenersSetUp;

pb.notifier.notify = function(options) {
    if (!listenersSetUp) {
        setUpNotificationListeners();
        listenersSetUp = true;
    }

    options.created = Date.now();

    var spec = { };
    spec.type = options.type;
    spec.title = options.title || '';
    spec.message = options.message || '';
    spec.iconUrl = options.iconUrl;

    if (options.contextMessage) {
        spec.contextMessage = options.contextMessage;
    }

    if (options.items) {
        spec.items = options.items;
    }

    if (options.imageUrl) {
        spec.imageUrl = options.imageUrl;
    }

    if (!options.priority && pb.settings.notificationDuration == 0) {
        options.priority = 2;
    }

    spec.priority = options.priority;

    if (pb.browserVersion >= 40) {
        spec.isClickable = true;
    }

    if (options.buttons) {
        if (options.buttons.length > 2) {
            var buttons = options.buttons;
            options.buttons = [];

            var lastButton = buttons.pop();
            options.buttons.push(lastButton);

            var labels = [];
            buttons.forEach(function(button) {
                labels.unshift(button.short_title || button.title);
            });

            buttons.push(lastButton);

            var title = labels.join(', ');

            options.buttons.unshift({
                'title': title,
                'iconUrl': 'action_overflow.png',
                'onclick': function() {
                    openMore(options);
                }
            });
        }

        spec.buttons = [];
        for (var i = 0, length = options.buttons.length; i < length; i++) {
            var button = options.buttons[i];
            spec.buttons.push({
                'title': button.title,
                'iconUrl': button.iconUrl
            });
        }
    }

    if (pb.isOpera) {
        // No buttons for opera
        delete spec.buttons;
        delete spec.isClickable;
    }

    var moreWindow = moreWindows[options.key];
    if (moreWindow) {
        chrome.windows.remove(moreWindow);
    }

    var existing = pb.notifier.active[options.key];

    if (existing && ((Date.now() - existing.created < timeOnScreen(existing)) || options.collapse)) {
        pb.notifier.active[options.key] = options;
        try {
            chrome.notifications.update(options.key, spec, function() { });
        } catch (e) {
            if (e.message && e.message.indexOf('contextMessage') != -1) {
                delete options.contextMessage;
                chrome.notifications.update(options.key, spec, function() { });
            }
        }
    } else {
        var notificationCreated = function() {
            pb.notifier.active[options.key] = options;
            if (pb.settings.playSound) {
                pb.alertSound.play();
            }
        };

        var createNotification = function() {
            chrome.notifications.create(options.key, spec, function() {
                if (chrome.runtime.lastError) {
                    pb.devtools(chrome.runtime.lastError);
                }
                notificationCreated();
            });
        };

        if (existing) {
            existing.onclose = null;
        }

        chrome.notifications.clear(options.key, function() {
            createNotification();
        });
    }
};

pb.notifier.dismiss = function(key) {
    chrome.notifications.clear(key, function(wasCleared) {
        pb.devtools('Dismissed ' + key);
        delete pb.notifier.active[key];
        pb.dispatchEvent('notifications_changed');
    });

    var moreWindow = moreWindows[key];
    if (moreWindow) {
        chrome.windows.remove(moreWindow);
    }
};

var timeOnScreen = function(options) {
    return options.priority && options.priority > 0 ? 25 * 1000 : 8 * 1000;
};

try {
    pb.alertSound = new Audio('alert.ogg');
} catch (e) {
    pb.alertSound = {
        'play': function() {
            pb.devtools('Unable to play sound');
        }
    };
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
// Set up the listeners for clicks and closes
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

var setUpNotificationListeners = function() {
    chrome.notifications.onClicked.addListener(function(key) {
        utils.wrap(function() {
            var notification = pb.notifier.active[key];
            if (notification) {
                if (notification.onclick) {
                    notification.onclick();
                }

                if (notification.onclose) {
                    notification.onclose();
                }

                delete pb.notifier.active[key];
                pb.dispatchEvent('notifications_changed');
            }

            chrome.notifications.clear(key, function(wasCleared) {
            });
        });
    });

    chrome.notifications.onClosed.addListener(function(key, byUser) {
        utils.wrap(function() {
            var notification = pb.notifier.active[key];
            if (notification && byUser) {
                if (notification.onclose) {
                    notification.onclose();
                }

                delete pb.notifier.active[key];
                pb.dispatchEvent('notifications_changed');
            }
        });
    });

    chrome.notifications.onButtonClicked.addListener(function(key, index) {
        utils.wrap(function() {
            var notification = pb.notifier.active[key];
            if (notification) {
                notification.buttons[index].onclick();

                if (notification.onclose) {
                    notification.onclose();
                }

                delete pb.notifier.active[key];
                pb.dispatchEvent('notifications_changed');

                // https://code.google.com/p/chromium/issues/detail?id=335918
                var timeTillHidden = timeOnScreen(notification);
                if (pb.browserVersion > 31 && (Date.now() - notification.created > timeTillHidden)) {
                    chrome.windows.create({
                        'url': 'about:blank',
                        'type': 'popup',
                        'width': 1,
                        'height': 1,
                        'left': -100,
                        'top': -100
                    }, function(window) {
                        chrome.windows.remove(window.id);
                    });
                }
            }

            chrome.notifications.clear(key, function(wasCleared) {
            });
        });
    });
};

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
// Power the "More" popup
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

var moreWindows = {};
var moreOptions = {};

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type == 'more_get_options') {
        sendResponse(moreOptions[sender.tab.windowId]);
    } else if (message.type == 'more_main_click') {
        moreOptions[sender.tab.windowId].onclick();
        chrome.windows.remove(sender.tab.windowId);
    } else if (message.type == 'more_button_click') {
        moreOptions[sender.tab.windowId].allButtons[message.index].onclick();
        chrome.windows.remove(sender.tab.windowId);
    }
});

chrome.windows.onRemoved.addListener(function(windowId) {
    var options = moreOptions[windowId];
    if (options) {
        delete moreWindows[options.key];
        delete moreOptions[windowId];
    }
});

var openMore = function(options) {
    var width = 360;
    var height = 260;

    // Position the More window based on the platform
    // Mac in top-right, Windows in bottom-right
    var top;
    if (navigator.platform.indexOf('Mac') >= 0) {
        top = 40;
    } else {
        top = window.screen.availHeight - height - 110;
    }

    var left = window.screen.availWidth - width - 20;

    var spec = {
        'type': 'popup',
        'focused': true,
        'url': 'more.html?key=' + options.key,
        'width': width,
        'height': height,
        'top': top,
        'left': left
    };

    chrome.windows.create(spec, function(window) {
        moreWindows[options.key] = window.id;
        moreOptions[window.id] = options;
        chrome.windows.update(window.id, { 'focused': true }, function() {
        });
    });
};
