'use strict';

pb.notifier.notify = function(options) {
    var spec = {
        'key': options.key,
        'title': options.title,
        'message': options.message,
        'contextMessage': options.contextMessage,
        'iconUrl': options.iconUrl
    };

    if (spec.message && spec.message.length > 500) {
        spec.message = spec.message.substring(0, 500);
    }

    self.port.emit('show_notification', spec);
};

pb.notifier.dismiss = function(key) {
    var options = pb.notifier.active[key];
    if (options && options.onclose) {
        options.onclose();
    }

    delete pb.notifier.active[key];

    pb.dispatchEvent('notifications_changed');
};
