'use strict';

if (!self.port && !window.chrome && !window.safari) {
    throw new Error('Shouldn\'t be here');
}

var pb = {
    'www': 'https://www.pushbullet.com',
    'api': 'https://api.pushbullet.com',
    'ws': 'wss://stream.pushbullet.com/websocket',
    'stream': 'https://stream.pushbullet.com/streaming',
    'andrelytics': 'https://zebra.pushbullet.com'
};

pb.isOpera = navigator.userAgent.indexOf('OPR') >= 0;

if (window.chrome) {
    pb.version = parseInt(chrome.runtime.getManifest().version);
    pb.browserVersion = parseInt(window.navigator.appVersion.match(/Chrome\/(\d+)\./)[1], 10);
    pb.userAgent = 'Pushbullet ' + (pb.isOpera ? 'Opera' : 'Chrome') + ' ' + pb.version;
} else if (window.safari) {
    pb.version = parseInt(safari.extension.bundleVersion);
    pb.browserVersion = parseInt(window.navigator.appVersion.match(/Version\/(\d+)\./)[1], 10);
    pb.userAgent = 'Pushbullet Safari '  + pb.version;
} else {
    var params = utils.getParams(location.search);
    pb.browserVersion = parseInt(window.navigator.userAgent.match(/Firefox\/(\d+)\./)[1]);
    pb.version = params['version'];
    pb.userAgent = 'Pushbullet Firefox '  + pb.version;
}

pb.rollingLog = [];
pb.devtools = function(message) {
    var line;
    if (message instanceof Object || message instanceof Array) {
        line = message;
    } else {
        line = new Date().toLocaleString() + ' - ' + message;
    }

    console.devtools(line);
    pb.rollingLog.push(JSON.stringify(line));

    if (pb.rollingLog.length > 400) {
        pb.rollingLog.shift();
    }
};

pb.popOutPanel = function() {
    pb.devtools('Popping out panel');

    pb.track({
        'name': 'panel_popped_out'
    });

    if (window.chrome) {
        var popoutUrl = chrome.extension.getURL('panel.html');

        chrome.tabs.query({ url: popoutUrl }, function(tabs) {
            if (tabs.length > 0) {
                chrome.windows.update(tabs[0].windowId, { 'focused': true }, function() {
                    chrome.tabs.update(tabs[0].id, { 'active': true }, function() {
                    });
                });
            } else {
                chrome.windows.create({
                    'url': popoutUrl + '#popout',
                    'type': 'popup',
                    'width': 640,
                    'height': 456,
                    'focused': true
                });
            }
        });
    }
};
