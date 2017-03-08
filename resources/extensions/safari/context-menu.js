'use strict';

pb.addEventListener('signed_in', function(e) {
    pb.addEventListener('locals_changed', function(e) {
        pb.updateContextMenu();
    });
});

pb.updateContextMenu = function() {
    if (window.chrome) {
        setUpChromeMenu();
    } else if (window.safari) {
        setUpSafariMenu();
    } else {
        setUpFirefoxMenu();
    }
};

var setUpChromeMenu = function() {
    chrome.contextMenus.removeAll();

    try {
        if (pb.isSnoozed()) {
            chrome.contextMenus.create({
                'title': text.get('unsnooze'),
                'contexts': ['browser_action'],
                'onclick': function() {
                    pb.unsnooze();
                    pb.updateContextMenu();
                }
            });
        } else {
            chrome.contextMenus.create({
                'title': text.get('snooze'),
                'contexts': ['browser_action'],
                'onclick': function() {
                    pb.snooze();
                    pb.updateContextMenu();
                }
            });
        }
    } catch (e) { }

    if (!chrome.runtime.getManifest().key || chrome.runtime.getManifest().key == 'ojgjlklooabjlkaphkfebgngpebicgen') {
        chrome.contextMenus.create({
            'title': 'X-Ray',
            'contexts': ['browser_action'],
            'onclick': function() {
                pb.openTab('/x-ray.html');
            }
        });
    }


    if (!pb.settings.showContextMenu || !pb.local.devices) {
        return;
    }

    var contexts = ['page', 'link', 'selection', 'image'];

    var devices = utils.asArray(pb.local.devices).sort(function(a, b) {
        return b.created - a.created;
    });

    devices.unshift({
        'name': text.get('all_of_my_devices')
    });

    devices.forEach(function(target) {
        chrome.contextMenus.create({
            'title': utils.streamDisplayName(target),
            'contexts': contexts,
            'onclick': function(info, tab) {
                contextMenuItemClicked(target, info, tab);
            }
        });
    });

    var chats = utils.asArray(pb.local.chats).sort(function(a, b) {
        return b.created - a.created;
    });

    if (devices.length > 0 && chats.length > 0) {
        chrome.contextMenus.create({
            'type': 'separator',
            'contexts': contexts
        });
    }

    chats.forEach(function(target) {
        chrome.contextMenus.create({
            'title': utils.streamDisplayName(target),
            'contexts': contexts,
            'onclick': function(info, tab) {
                contextMenuItemClicked(target, info, tab);
            }
        });
    });

    var contextMenuItemClicked = function(target, info, tab) {
        var push = {};

        if (target.with) {
            push.email = target.with.email;
        } else if (target.iden) {
            push.device_iden = target.iden;
        }

        if (info.srcUrl) {
            utils.downloadImage(info.srcUrl, function(blob) {
                blob.name =  utils.imageNameFromUrl(info.srcUrl);
                push.file = blob;
                pb.sendPush(push);
            });
            return;
        } else if (info.linkUrl) {
            push.type = 'link';
            push.title = info.selectionText;
            push.url = info.linkUrl;
        } else if (info.selectionText) {
            push.type = 'note';
            push.body = info.selectionText;
        } else {
            push.type = 'link';
            push.title = tab.title;
            push.url = info.pageUrl;
        }

        pb.sendPush(push);
    };
};

var setUpSafariMenu = function() {
    if (pb.safariListenerAdded) {
        return;
    }

    pb.safariListenerAdded = true;

    safari.application.addEventListener('contextmenu', function(e) {
        if (!pb.settings.showContextMenu) {
            return;
        }

        if (!pb.local.devices) {
            return;
        }

        var devices = utils.asArray(pb.local.devices).sort(function(a, b) {
            return b.created - a.created;
        });

        devices.forEach(function(device) {
            if (device.type != 'safari') {
                e.contextMenu.appendContextMenuItem('push:' + device.iden, 'Push this to ' + device.nickname);
            }
        });
    }, false);

    safari.application.addEventListener('command', function(e) {
        if (e instanceof SafariExtensionContextMenuItemCommandEvent) {
            var push = {
                'device_iden': e.target.command.split(':')[1]
            };

            var userInfo = e.userInfo;
            if (userInfo.selection.length > 0 && userInfo.tagName != 'A') {
                push.type = 'note';
                push.body = userInfo.selection;
            } else if (userInfo.src) {
                utils.downloadImage(userInfo.src, function(blob) {
                    blob.name =  utils.imageNameFromUrl(userInfo.src);
                    push.file = blob;
                    pb.sendPush(push);
                });
                return;
            } else {
                push.type = 'link';
                push.title = userInfo.title;
                push.url = userInfo.url;
            }

            pb.sendPush(push);
        }
    }, false);
};

var setUpFirefoxMenu = function() {
    self.port.emit('set_context_menu');

    if (!pb.settings.showContextMenu || !pb.local.devices) {
        return;
    }

    var entries = [];

    var devices = utils.asArray(pb.local.devices).sort(function(a, b) {
        return b.created - a.created;
    });

    devices.forEach(function(target) {
        var entry = {
            'label': utils.streamDisplayName(target)
        };

        if (target.with) {
            entry.email = target.with.email_normalized;
        } else {
            entry.iden = target.iden;
        }

        entries.push(entry);
    });

    self.port.emit('set_context_menu', entries);
};

if (self.port) {
    self.port.on('context_menu_item_clicked', function(item) {
        var push = { };

        var message = item.message;
        if (message.url) {
            push.type = 'link';
            push.title = message.title;
            push.url = message.url;
        } else if (message.selection) {
            push.type = 'note';
            push.body = message.selection;
        } else {
            return;
        }

        var entry = item.entry;
        if (entry.email) {
            push.email = entry.email;
        } else {
            push.device_iden = entry.iden;
        }

        pb.sendPush(push);
    });
}
