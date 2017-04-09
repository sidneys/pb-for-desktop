'use strict'

var textMappings = {
    'mute-app-question': 'how_to_unmute_app',
    'mute-app-answer': 'how_to_unmute_app_answer',
    'pro-required': 'pushbullet_pro_required',
    'pro-required-desc': 'pushbullet_pro_feature',
    'pro-dialog-more': 'learn_more',
    'pro-dialog-cancel': 'cancel'
}

var categories = {
    'general': {
        'label': chrome.i18n.getMessage('general'),
        'options': [{
            'key': 'backgroundPermission',
            'label': chrome.i18n.getMessage('option_background_permission'),
            'desc': chrome.i18n.getMessage('option_background_permission_desc'),
            'cssClasses': ['chrome', 'windows']
        }, {
            'key': 'useDarkIcon',
            'label': chrome.i18n.getMessage('option_use_dark_icon'),
            'desc': chrome.i18n.getMessage('option_use_dark_icon_desc')
        }, {
            'key': 'showNotificationCount',
            'label': chrome.i18n.getMessage('option_show_notification_count'),
            'desc': chrome.i18n.getMessage('option_show_notification_count_desc'),
        }, {
            'key': 'openMyLinksAutomatically',
            'label': chrome.i18n.getMessage('option_open_my_pushes_automatically'),
            'desc': chrome.i18n.getMessage('option_open_my_pushes_automatically_desc')
        }, {
            'key': 'automaticallyAttachLink',
            'label': chrome.i18n.getMessage('option_automatically_attach_link'),
            'desc': chrome.i18n.getMessage('option_automatically_attach_link_desc')
        }]
    },
    'notifications': {
        'label': chrome.i18n.getMessage('notifications'),
        'options': [{
            'key': 'showMirrors',
            'label': chrome.i18n.getMessage('option_show_mirrors'),
            'desc': chrome.i18n.getMessage('option_show_mirrors_desc')
        }, {
            'key': 'onlyShowTitles',
            'label': chrome.i18n.getMessage('option_only_show_titles'),
            'desc': chrome.i18n.getMessage('option_only_show_titles_desc')
        }, {
            'key': 'playSound',
            'label': chrome.i18n.getMessage('option_play_sound'),
            'desc': chrome.i18n.getMessage('option_play_sound_desc'),
            'cssClasses': ['chrome']
        }]
    },
    'advanced': {
        'label': chrome.i18n.getMessage('advanced'),
        'options': [{
            'key': 'showContextMenu',
            'label': chrome.i18n.getMessage('option_show_context_menu'),
            'desc': chrome.i18n.getMessage('option_show_context_menu_desc')
        }, {
            'key': 'clipboardPermission',
            'label': chrome.i18n.getMessage('option_clipboard_permission'),
            'desc': chrome.i18n.getMessage('option_clipboard_permission_desc'),
            'cssClasses': ['chrome', 'not-mac'],
            'requiresPro': true
        }, {
            'key': 'allowInstantPush',
            'label': chrome.i18n.getMessage('option_allow_instant_push'),
            'desc': chrome.i18n.getMessage('option_allow_instant_push_desc')
        }]
    }
}

window.init = function() {
    Object.keys(textMappings).forEach(function(key) {
        document.getElementById(key).textContent = chrome.i18n.getMessage(textMappings[key])
    })

    document.getElementById('logo-link').href = pb.www
    document.getElementById('version').textContent = 'v' + pb.version

    if (pb.local && pb.local.user) {
        document.getElementById('account-holder').style.display = 'block'
        document.getElementById('account-image').src = pb.local.user.image_url || 'chip_user.png'

        if (pb.local.user.pro) {
            document.getElementById('ribbon').style.display = 'block'
        }
    }

    setUpOptions()

    if (window.location.hash) {
        var hashTab = document.getElementById('tab-' + window.location.hash.substring(1).toLowerCase())
        if (hashTab) {
            hashTab.onclick()
        }
    } else {
        document.getElementById('tab-' + Object.keys(categories)[0]).onclick()
    }

    pb.track({
        'name': 'goto',
        'url': '/options'
    })
}

var setUpOptions = function() {
    var tabsHolder = document.getElementById('tabs')
    var optionsHolder = document.getElementById('options')

    var resetTabs = function() {
        Object.keys(categories).forEach(function(key) {
            var tab = document.getElementById('tab-' + key)
            tab.className = 'tab'
            var tabOptions = document.getElementById('tab-' + key + '-options')
            tabOptions.style.display = 'none'
        })
    }

    var fillOptions = function(category, container) {
        category.options.forEach(function(option) {
            var div = renderOption(option)
            container.appendChild(div)
        })
    }

    var renderOption = function(option) {
        var checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.id = option.key + '-checkbox'
        checkbox.className = 'option-checkbox'
        checkbox.checked = pb.settings[option.key] && ((pb.local.user && pb.local.user.pro) || !option.requiresPro)
        checkbox.onclick = function() {
            if (option.requiresPro && (!pb.local.user || !pb.local.user.pro)) {
                checkbox.checked = false
                showProPrompt()
            } else {
                optionChanged(option.key, checkbox.checked)
            }
        }

        var labelText = document.createElement('span')
        labelText.className = 'option-title'
        labelText.textContent = option.label

        var label = document.createElement('label')
        label.id = option.key + '-label'
        label.className = 'option-label'
        label.appendChild(checkbox)
        label.appendChild(labelText)

        if (option.requiresPro) {
            var ribbon = document.createElement('img')
            ribbon.src = 'ribbon.png'
            ribbon.className = 'ribbon-small'
            label.appendChild(ribbon)
        }

        var desc = document.createElement('div')
        desc.className = 'option-desc'
        desc.textContent = option.desc

        var div = document.createElement('div')
        div.id = option.key
        div.className = 'option'
        div.appendChild(label)
        div.appendChild(desc)

        if (option.cssClasses) {
            option.cssClasses.forEach(function(cssClass) {
                div.classList.add(cssClass)
            })
        }

        return div
    }

    Object.keys(categories).forEach(function(key) {
        var category = categories[key]

        var tab = document.createElement('div')
        tab.id = 'tab-' + key
        tab.href = '#' + key
        tab.textContent = category.label
        tab.className = 'tab'
        tab.onclick = function() {
            resetTabs()
            tab.className = 'tab selected'
            tabOptions.style.display = 'block'
            window.location.hash = key
        }

        tabsHolder.appendChild(tab)

        var tabOptions = document.createElement('div')
        tabOptions.id = 'tab-' + key + '-options'
        fillOptions(category, tabOptions)

        optionsHolder.appendChild(tabOptions)
    })

    addDurationOption()

    addEndToEndOption()

    if (pb.browser == 'chrome') {
        setUpChromePermissionOptions()
        setUpInstantPushOptions()
    }

    checkNativeClient()
}

var optionChanged = function(key, value) {
    if (value == null) {
        delete pb.settings[key]
    } else {
        pb.settings[key] = value
    }
    
    if (pb.setSettings) {
        pb.setSettings(pb.settings)
    } else {
        pb.saveSettings()
        pb.loadSettings()
    }
}

var addDurationOption = function() {
    var notificationsOptions = document.getElementById('tab-notifications-options')

    var duration = document.createElement('div')
    duration.className = 'option option-desc'

    var label = document.createElement('span')
    label.className = 'option-label'
    label.style.display = 'inline'
    label.textContent = chrome.i18n.getMessage('option_notification_duration')

    var durationSelect = document.createElement('select')
    durationSelect.style.marginLeft = '6px'

    var option1 = document.createElement('option')
    option1.value = '8'
    option1.textContent = '8 seconds'

    var option2 = document.createElement('option')
    option2.value = '0'
    option2.selected = 'true'
    option2.textContent = '30 seconds'

    durationSelect.add(option1)
    durationSelect.add(option2)

    if (pb.settings.notificationDuration == '0') {
        durationSelect.selectedIndex = 1
    } else {
        durationSelect.selectedIndex = 0
    }

    durationSelect.onchange = function() {
        optionChanged('notificationDuration', durationSelect.options[durationSelect.selectedIndex].value)
    }

    duration.appendChild(label)
    duration.appendChild(durationSelect)
    duration.classList.add('chrome')
    duration.classList.add('not-opera')

    notificationsOptions.insertBefore(duration, notificationsOptions.firstChild)
}

var setUpChromePermissionOptions = function() {
    setUpBackgroundPermission()    
    setUpClipboardPermission()
}

var setUpBackgroundPermission = function() {
    var backgroundPermission = document.getElementById('backgroundPermission')
    var backgroundPermissionCheckbox = document.getElementById('backgroundPermission-checkbox')

    var hasPermission, permission = { 'permissions': ['background'] }

    var onPermissionUpdate = function(granted) {
        hasPermission = !!granted
        backgroundPermissionCheckbox.checked = hasPermission
    }

    chrome.permissions.contains(permission, onPermissionUpdate)

    backgroundPermissionCheckbox.addEventListener('click', function(event) {
        if (hasPermission) {
            chrome.permissions.remove(permission,
                function(removed) {
                    onPermissionUpdate(!removed)
                }
            )
        } else {
            chrome.permissions.request(permission, onPermissionUpdate)
        }
    })
}

var setUpClipboardPermission = function() {
    var clipboardPermission = document.getElementById('clipboardPermission')
    var clipboardPermissionCheckbox = document.getElementById('clipboardPermission-checkbox')

    var hasPermission, permission = { 'permissions': ['clipboardRead', 'clipboardWrite'] }

    var onPermissionUpdate = function(granted) {
        hasPermission = !!granted
        clipboardPermissionCheckbox.checked = hasPermission && pb.local.user.pro

        if (hasPermission) {
            clipboardPermission.style.display = 'block'
        }
    }

    chrome.permissions.contains(permission, onPermissionUpdate)

    clipboardPermissionCheckbox.addEventListener('click', function(event) {
        if (hasPermission) {
            chrome.permissions.remove(permission,
                function(removed) {
                    onPermissionUpdate(!removed)
                }
            )
        } else {
            if (pb.local.user && pb.local.user.pro) {
                chrome.permissions.request(permission, onPermissionUpdate)
            }
        }
    })
}

var setUpInstantPushOptions = function() {
    var deviceSelect = document.createElement('select')
    deviceSelect.style.marginLeft = '6px'

    var instantPushLabel = document.getElementById('allowInstantPush-label')
    instantPushLabel.appendChild(deviceSelect)

    var instantPushCheckbox = document.getElementById('allowInstantPush-checkbox')

    if (pb.local.user) {
        var onclick = instantPushCheckbox.onclick

        deviceSelect.disabled = !instantPushCheckbox.checked

        var instantOptionChanged = function() {
            deviceSelect.disabled = !instantPushCheckbox.checked

            if (instantPushCheckbox.checked) {
                optionChanged('instantPushIden', deviceSelect.value)
            } else {
                optionChanged('instantPushIden', null)
            }

            onclick()
        }

        instantPushCheckbox.onclick = instantOptionChanged

        if (pb.local.devices) {
            var deviceKeys = Object.keys(pb.local.devices),
                device, deviceOption

            deviceOption = document.createElement('option')

            deviceOption.value = '*'
            deviceOption.textContent = chrome.i18n.getMessage('all_of_my_devices')

            deviceSelect.add(deviceOption)

            deviceKeys.map(function(key) {
                device = pb.local.devices[key]
                deviceOption = document.createElement('option')

                deviceOption.value = device.iden
                deviceOption.textContent = device.nickname

                deviceSelect.add(deviceOption)
            })
        }

        deviceSelect.onchange = instantOptionChanged

        if (pb.settings.instantPushIden) {
            deviceSelect.value = pb.settings.instantPushIden
        } else if (deviceSelect.children.length) {
            deviceSelect.value = deviceSelect.firstChild.value
        }

        var shortcutLink = document.createElement('a')

        chrome.commands.getAll(function(commands) {
            for (var commandKey in commands) {
                var command = commands[commandKey]
                if (command.name === 'instant-push-current-tab' && command.shortcut) {
                    shortcutLink.textContent = ' ' + chrome.i18n.getMessage('option_instant_push_shortcuts', [command.shortcut])
                    return
                }
            }

            shortcutLink.textContent = chrome.i18n.getMessage('option_instant_push_shortcuts_not_set', [linkText])
        })

        document.getElementById('allowInstantPush').lastChild.appendChild(shortcutLink)

        shortcutLink.onclick = function() {
            pb.openTab('chrome://extensions/configureCommands')
        }
    } else {
        instantPushCheckbox.checked = false
        instantPushCheckbox.disabled = true
    }
}

var addEndToEndOption = function() {
    var advancedOptions = document.getElementById('tab-advanced-options')

    var container = document.createElement('div')
    container.className = 'option option-desc'

    var top = document.createElement('div')

    var label = document.createElement('span')
    label.className = 'option-label'
    label.style.display = 'inline'
    label.textContent = chrome.i18n.getMessage('end_to_end_password_label')

    var input = document.createElement('input')
    input.type = 'password'
    input.style.display = 'inline-block'
    input.style.width = '200px'
    input.style.border = '1px solid #95a5a6'
    input.style.padding = '4px 6px'
    input.style.marginLeft = '20px'
    input.value = pb.e2e.enabled ? btoa(pb.e2e.key) : ''

    var save = document.createElement('button')
    save.style.height = '28px'
    save.style.padding = '0'
    save.style.marginLeft = '10px'
    save.style.border = '1px solid transparent'
    save.style.padding = '0 5px'
    save.textContent = chrome.i18n.getMessage('save')

    save.onclick = function() {
        pb.e2e.setPassword(input.value)
    }

    var clear = document.createElement('button')
    clear.style.height = '28px'
    clear.style.padding = '0'
    clear.style.marginLeft = '10px'
    clear.style.border = '1px solid transparent'
    clear.style.padding = '0 5px'
    clear.className = 'gray'
    clear.textContent = chrome.i18n.getMessage('clear')

    clear.onclick = function() {
        input.value = ''
        save.click()
    }

    input.onkeypress = function(e) {
        if (e.keyCode == 13) {
            pb.e2e.setPassword(input.value)
        }
    }

    input.onfocus = function(e) {
        input.value = ''
    }

    top.appendChild(label)
    top.appendChild(input)
    top.appendChild(save)
    top.appendChild(clear)

    container.appendChild(top)

    var bottom = document.createElement('div')
    bottom.textContent = chrome.i18n.getMessage('end_to_end_password_desc')

    container.appendChild(bottom)

    advancedOptions.appendChild(container)
}

var showProPrompt = function() {
    document.getElementById('overlay').style.display = 'block'
    document.getElementById('overlay').onclick = function() {
        hideProPrompt()
    }
    document.getElementById('pro-dialog').onclick = function(e) {
        e.cancelBubble = true
    }
    document.getElementById('pro-dialog-cancel').onclick = function() {
        hideProPrompt()
    }
    document.getElementById('pro-dialog-more').onclick = function () {
        pb.openTab(pb.www + '/pro')
        hideProPrompt()
    }
}

var hideProPrompt = function() {
    document.getElementById('overlay').style.display = 'none'
}

var checkNativeClient = function() {
    var generalTab = document.getElementById('tab-general')
    var notificationsTab = document.getElementById('tab-notifications')
    var clipboardPermission = document.getElementById('clipboardPermission')

    utils.checkNativeClient(function(response) {
        if (response) {
            generalTab.onclick()
            notificationsTab.style.display = 'none'
            clipboardPermission.style.display = 'none'
        }
    })
}
