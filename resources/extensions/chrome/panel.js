'use strict'

var textMappings = {
    'sign-in': 'sign_in',
    'sign-up': 'panel_sign_up',
    'cant-sign-in': 'panel_cant_sign_in',
    'third-party-cookies': 'panel_third_party_cookies',
    'sign-out': 'sign_out',
    'options': 'options',
    'people-tab': 'people',
    'devices-tab': 'devices',
    'sms-tab': 'sms',
    'notifications-tab': 'notifications',
    'notifications-empty-text': 'no_notifications',
    'me-device-picker-label': 'recipient_placeholder',
    'sms-disclaimer-tooltip': 'sms_disclaimer',
    'compose-recipient-picker-label': 'recipient_placeholder'
}

var tabId
window.init = function() {
    if (!location.hash) {
        tabId = 'panel'
        setUp()
    } else {
        if (window.browser) { // Special case for Firefox since chrome.runtime.sendMessage doesn't seem to work yet
            chrome.tabs.query({ 'currentWindow': true, 'active' : true}, function(tabs) {
                tabId = tabs[0].id
                setUp()
            })
        } else {
            chrome.runtime.sendMessage({
                'type': 'loopback'
            }, function(response) {
                tabId = response.tabId
                setUp()
            })
        }
    }
}

var setUp = function() {
    if (location.hash) {
        document.body.classList.add(location.hash.substring(1))
    }

    Object.keys(textMappings).forEach(function(key) {
        document.getElementById(key).textContent = chrome.i18n.getMessage(textMappings[key])
    })

    var goToSite = function() {
        pb.openTab(pb.www)
    }

    document.getElementById('logo-link').onclick = goToSite
    document.getElementById('bullet-link').onclick = goToSite

    var signIn = function() {
        pb.openTab('https://www.pushbullet.com/signin?source=' + pb.browser)
    }

    document.getElementById('sign-in').onclick = signIn
    document.getElementById('sign-up').onclick = signIn

    document.getElementById('third-party-cookies').onclick = function() {
        pb.openTab('https://support.mozilla.org/en-US/kb/disable-third-party-cookies')
    }

    if (!pb.local.user) {
        return
    }

    setTimeout(function() {
        setUpPopout()
        setUpSettingsMenu()
        setUpNotificationsContent()
        setUpTabs()
        checkNativeClient()
        monitorAwake()
    }, 100)

    window.addEventListener('unload', onunload)

    pb.track({
        'name': 'goto',
        'url': location.hash ? '/panel' : '/popout'
    })
}

var onunload = function() {
    pb.setAwake(location.hash ? location.hash.substring(1) : 'panel', false)

    tearDownNotificationsContent()
    tearDownMessaging()
}

var setUpPopout = function() {
    var popout = document.getElementById('popout-holder')

    if (location.hash) {
        popout.style.display = 'none'
    } else {
        popout.onclick = function() {
            pb.popOutPanel()
        }
    }
}

var setUpSettingsMenu = function() {
    var settingsGear = document.getElementById('settings-gear')
    var settingsMenu = document.getElementById('settings-menu')
    var menuSink = document.getElementById('menu-sink')

    settingsGear.onclick = function() {
        settingsMenu.style.display = 'block'
        menuSink.style.display = 'block'
    }

    menuSink.onclick = function() {
        settingsMenu.style.display = 'none'
        menuSink.style.display = 'none'
    }

    var snooze = document.getElementById('snooze')

    var setUpSnooze = function() {
        if (localStorage.snoozedUntil > Date.now()) {
            snooze.textContent = chrome.i18n.getMessage('unsnooze')
            snooze.onclick = function() {
                pb.unsnooze()

                setTimeout(function() {
                    setUpSnooze()
                }, 200)
            }
        } else {
            snooze.textContent = chrome.i18n.getMessage('snooze')
            snooze.onclick = function() {
                pb.snooze()

                setTimeout(function() {
                    setUpSnooze()
                }, 100)
            }
        }
    }

    setUpSnooze()

    var options = document.getElementById('options')
    options.onclick = function() {
        var optionsUrl = chrome.extension.getURL('options.html')

        chrome.tabs.query({ url: optionsUrl }, function(tabs) {
            if (tabs.length) {
                chrome.tabs.update(tabs[0].id, { active: true })
            } else {
                pb.openTab(optionsUrl)
            }

            menuSink.onclick()
        })

        menuSink.onclick()
    }

    document.getElementById('sign-out').onclick = function() {
        pb.signOut()
        window.close()
    }
}

var setUpTabs = function() {
    var peopleTab = document.getElementById('people-tab')
    var devicesTab = document.getElementById('devices-tab')
    var smsTab = document.getElementById('sms-tab')
    var notificationsTab = document.getElementById('notifications-tab')

    var tabs = [peopleTab, devicesTab, smsTab, notificationsTab]

    var messagingContent = document.getElementById('messaging-content')
    var notificationsContent = document.getElementById('notifications-content')

    var onclick = function(e) {
        tabs.forEach(function(tab) {
            tab.classList.remove('selected')
        })

        e.target.classList.add('selected')

        localStorage.activePanelTab = e.target.id.split('-')[0]

        if (e.target == notificationsTab) {
            notificationsContent.style.display = 'block'
            messagingContent.style.display = 'none'

            tearDownMessaging()
        } else {
            notificationsContent.style.display = 'none'
            messagingContent.style.display = 'block'

            if (e.target == smsTab) {
                setUpMessaging('sms')
            } else if (e.target == devicesTab) {
                setUpMessaging('devices')
            } else {
                setUpMessaging('people')
            }
        }
    }

    tabs.forEach(function(tab) {
        tab.onclick = onclick
    })

    var smsDevices = Object.keys(pb.local.devices).map(function(key) {
        return pb.local.devices[key]
    }).filter(function(device) {
        return device.has_sms
    }).sort(function(a, b) {
        return a.created - b.created
    })

    if (smsDevices.length > 0) {
        smsTab.style.display = 'block'
    } else {
        smsTab.style.display = 'none'
    }

    if (localStorage.activePanelTab == 'notifications') {
        notificationsTab.click()
    } else if (localStorage.activePanelTab == 'sms' && smsDevices.length > 0) {
        smsTab.click()
    } else if (localStorage.activePanelTab == 'devices') {
        devicesTab.click()
    } else {
        peopleTab.click()
    }
}

var checkNativeClient = function() {
    utils.checkNativeClient(function(response) {
        if (response) {
            document.getElementById('snooze').style.display = 'none'
            document.getElementById('notifications-empty').classList.add('desktop-app')
            document.getElementById('notifications-empty-text').textContent = chrome.i18n.getMessage('alert_desktop_app_notifications')
        }
    })
}

var monitorAwake = function() {
    pb.setAwake(location.hash ? location.hash.substring(1) : 'panel', true)

    document.body.onmousemove = function(e) {
        if (window.mouseLastX !== e.clientX || window.mouseLastY !== e.clientY) {
            reportAwake()
        }

        window.mouseLastX = e.clientX
        window.mouseLastY = e.clientY
    }
}

var lastReportedAwake = Date.now()
var reportAwake = function() {
    if (Date.now() - lastReportedAwake > 15 * 1000) {
        lastReportedAwake = Date.now()
        pb.setAwake(location.hash ? location.hash.substring(1) : 'panel', true)
    }
}
