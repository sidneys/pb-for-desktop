'use strict';

pb.addEventListener('signed_out', function(e) {
    main();
});

var main = function() {
    if (!localStorage.client_id) {
        localStorage.client_id = utils.guid();
    }

    var lastVersion = localStorage.lastVersion;

    pb.loadSettings();

    transitionLocalStorage(lastVersion);

    showUpdateNotification(lastVersion);

    localStorage.lastVersion = pb.version;

    onceWeHaveAnApiKey(function() {
        pb.devtools('Signed in with API key ' + pb.local.apiKey);

        onceWeHaveTheUser(function() {
            pb.devtools('Bootstrapping...');

            pb.dispatchEvent('signed_in');
        });
    });
};

var onceWeHaveTheUser = function(done) {
    utils.untilWithBackoff(
        function() {
            return !!pb.local.user;
        },
        function(next) {
            if (localStorage.user) {
                pb.local.user = JSON.parse(localStorage.user);
                next();
            } else {
                pb.get(pb.api + '/v2/users/me', function(user) {
                    if (user) {
                        localStorage.user = JSON.stringify(user);
                        pb.local.user = user;

                        pb.dispatchEvent('active');
                    }

                    next();
                });
            }
        },
        function() {
            done();
        }
    );
};

var onceWeHaveAnApiKey = function(done) {
    var processPollResult = function(apiKey, next) {
        if (validApiKey(apiKey)) {
            localStorage.apiKey = apiKey;
            pb.local.apiKey = apiKey;
        } else {
            showSignInNotification();
        }

        next();
    };

    utils.until(function() {
        return !!pb.local.apiKey;
    }, function(next) {
        if (validApiKey(localStorage.apiKey)) {
            pb.local.apiKey = localStorage.apiKey;
            next();
        } else {
            if (window.chrome) {
                chrome.cookies.get({ 'url': 'https://www.pushbullet.com', 'name': 'api_key' }, function(cookie) {
                    utils.wrap(function() {
                        if (cookie) {
                            processPollResult(cookie.value, next);
                        } else {
                            processPollResult(null, next);
                        }
                    });
                });
            } else if (window.safari) {
                processPollResult(localStorage.apiKey, next);
            } else {
                self.port.once('api_key', function(apiKey) {
                    processPollResult(apiKey, next);
                });

                self.port.emit('get_api_key', pb.www);
            }
        }
    }, function() {
        done();
    });
};

var transitionLocalStorage = function(lastVersion) {
    if (lastVersion < 200) {
        var apiKey = localStorage.apiKey || localStorage.api_key;
        var e2eKey = localStorage.e2eKey;

        localStorage.clear();

        if (validApiKey(apiKey)) {
            localStorage.apiKey = apiKey;
        }

        if (validApiKey(e2eKey)) {
            localStorage.e2eKey = e2eKey;
        }

        pb.saveSettings();
    }

    if (lastVersion < 248) {
        delete localStorage.hasShownSignInNotification;
    }

    if (lastVersion < 286) {
        delete localStorage.user;
    }

    if (lastVersion != pb.version) {
        delete localStorage.activeLastReported;
    }
};

var showSignInNotification = function() {
    if (!localStorage.hasShownSignInNotification) {
        localStorage.hasShownSignInNotification = true;

        var options = {
            'type': 'basic',
            'key': 'sign_in',
            'title': text.get('thanks_for_installing_title'),
            'message': text.get('thanks_for_installing_message'),
            'iconUrl': 'icon_48.png',
            'onclick': function() {
                var client = window.chrome ? pb.isOpera ? 'opera' : 'chrome' : window.safari ? 'safari' : 'firefox';
                pb.openTab('https://www.pushbullet.com/signin?source=' + client);
            }
        };

        pb.notifier.show(options);
    }
};

var showUpdateNotification = function(lastVersion) {
    var showForChrome = window.chrome && !pb.isOpera && lastVersion && lastVersion < 200;
    var showForOpera = window.chrome && pb.isOpera && lastVersion && lastVersion < 200;
    var showForSafari = window.safari && lastVersion && lastVersion < 200 && false;
    var showForFirefox = self && self.port && lastVersion < 200;
    if (showForChrome || showForOpera || showForSafari || showForFirefox) {
        var options = {
            'type': 'basic',
            'key': 'update',
            'title': text.get('updated_notif_title'),
            'message': text.get('updated_notif_message'),
            'iconUrl': 'icon_48.png',
            'onclick': function() {
                var url = (window.safari ? safari.extension.baseURI : '') + 'changelog.html';
                pb.openTab(url);
            }
        };

        pb.notifier.show(options);
    }
};

var validApiKey = function(apiKey) {
    return apiKey && apiKey.length > 0 && apiKey != 'undefined' && apiKey != 'null';
};

pb.signOut = function() {
    pb.fallAsleep();

    pb.track({
        'name': 'signed_out'
    });

    localStorage.clear();

    localStorage.hasShownSignInNotification = true;

    pb.saveSettings();

    if (window.chrome) {
        chrome.cookies.remove({ 'url': 'https://www.pushbullet.com', 'name': 'api_key' });
    } else if (window.safari) {
        // Doesn't use cookies, nothing to do
    } else {
        self.port.emit('signed_out', pb.www);
    }

    pb.dispatchEvent('signed_out');

    pb.clearEventListeners();

    clearTimeout(pb.snoozeTimeout);
};

main();
