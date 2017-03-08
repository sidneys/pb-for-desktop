'use strict';

pb.notifier = {
    'active': {}
};

pb.notifier.show = function(options) {
    pb.devtools('Showing notification with key ' + options.key);

    options.allButtons = options.buttons;
    options.fullMessage = options.message;
    options.allItems = options.items;

    if (pb.settings.onlyShowTitles) {
        if (options.type == 'list') {
            options.items = [];
        }

        options.message = '';
    }

    if (pb.settings.showMirrors) {
        if (pb.isSnoozed()) {
            pb.devtools('Not showing notification ' + options.key + ', snoozed');
            return;
        }

        pb.notifier.notify(options);

        if (options.key != 'update') {
            pb.dispatchEvent('active');
        }
    }

    pb.notifier.active[options.key] = options;

    pb.dispatchEvent('notifications_changed');
};

pb.notifier.dismiss = function(key) {
    // Stub, overwritten in notifications-chrome.js etc.
};
