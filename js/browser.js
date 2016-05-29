'use strict';

var ipc = require('electron').ipcRenderer;
var NativeNotification = Notification;

/**
 * @description Resolves a Pushbullet Push object to an image URL.
 * @param {Object} push - Pushbullet Push object (see https://docs.pushbullet.com/#push)
 * @returns {String}
 */
var getIconForPushbulletPush = function(push) {

    var imageUrl;

    // Account image
    var accountImage,
        accountIdShort = push['receiver_iden'],
        accountList = window.pb.api.accounts.all;

    for (var account of accountList) {
        if (account['iden'].startsWith(accountIdShort)) {
            //console.log('account', account);
            accountImage = account['image_url'];
        }
    }

    // Channel image (i.e. IFTTT, Zapier)
    var channelImage,
        channelId = push['client_iden'],
        channelList = window.pb.api.grants.all;

    for (var channel of channelList) {
        if (channel['client']['iden'] === channelId) {
            //console.log('channel', channel);
            channelImage = channel['client']['image_url'];
        }
    }

    // Device image (i.e. Phone, Browser)
    var deviceImage,
        deviceId = push['source_device_iden'],
        deviceList = window.pb.api.devices.all;

    for (var device of deviceList) {
        if (device['iden'] === deviceId) {
            //console.log('device', device);
            deviceImage = 'http://www.pushbullet.com/img/deviceicons/' + device['icon'] + '.png';
        }
    }

    // Fallback behaviour
    imageUrl = channelImage || deviceImage || accountImage;

    return imageUrl;
};


Notification = function(title, options) {
  var notification = new NativeNotification(title, options);

  ipc.send('change-icon');

  notification.addEventListener('click', () => {
    ipc.send('notification-click');
  });

  return notification;
};

Notification.prototype = NativeNotification.prototype;
Notification.permission = NativeNotification.permission;
Notification.requestPermission = NativeNotification.requestPermission.bind(Notification);
