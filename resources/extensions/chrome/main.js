'use strict'

pb.addEventListener('signed_out', function(e) {
    main()
})

var main = function() {
    if (!localStorage.client_id) {
        localStorage.client_id = utils.guid()
    }

    var lastVersion = localStorage.lastVersion

    pb.loadSettings()

    transitionLocalStorage(lastVersion)

    localStorage.lastVersion = pb.version

    getApiKey(function(apiKey) {
        pb.local.apiKey = apiKey

        pb.log('Signed in with API key ' + pb.local.apiKey)

        loadUser(function(user) {
            pb.local.user = user

            pb.log('Bootstrapping...')

            pb.dispatchEvent('signed_in')
        })
    })
}

var transitionLocalStorage = function(lastVersion) {
    if (lastVersion && lastVersion < 316) {
        var apiKey = localStorage.apiKey || localStorage.api_key
        var e2eKey = localStorage.e2eKey

        localStorage.clear()

        if (apiKey && apiKey != 'null' && apiKey != 'undefined') {
            localStorage.apiKey = apiKey
        }

        if (e2eKey && e2eKey != 'null' && e2eKey != 'undefined') {
            localStorage.e2eKey = e2eKey
        }

        pb.saveSettings()
    }
}

var getApiKey = function(done) {
    if (localStorage.apiKey) {
        done(localStorage.apiKey)
    } else {
        chrome.cookies.get({ 'url': 'https://www.pushbullet.com', 'name': 'api_key' }, function(cookie) {
            if (cookie && cookie.value && cookie.value != 'undefined' && cookie.value != 'null') {
                localStorage.apiKey = cookie.value
                done(localStorage.apiKey)
            } else {
                showSignInNotification()

                setTimeout(function() {
                    getApiKey(done)
                }, 5000)
            }
        })
    }
}

var loadUser = function(done) {
    if (localStorage.user) {
        try {
            done(JSON.parse(localStorage.user))
        } catch(e) {
            delete localStorage.user
            loadUser(done)
        }
    } else {
        pb.get(pb.api + '/v2/users/me', function(user) {
            if (user) {
                localStorage.user = JSON.stringify(user)
                done(user)
                pb.dispatchEvent('active')
            } else {
                setTimeout(function() {
                    loadUser(done)
                }, 5000)
            }
        })
    }
}

var showSignInNotification = function() {
    if (!localStorage.hasShownSignInNotification) {
        localStorage.hasShownSignInNotification = true

        var options = {
            'type': 'basic',
            'key': 'sign_in',
            'title': chrome.i18n.getMessage('thanks_for_installing_title'),
            'message': chrome.i18n.getMessage('thanks_for_installing_message'),
            'iconUrl': 'icon_48.png',
            'onclick': function() {
                pb.openTab('https://www.pushbullet.com/signin?source=' + pb.browser)
            }
        }

        pb.notifier.show(options)
    }
}

main()
