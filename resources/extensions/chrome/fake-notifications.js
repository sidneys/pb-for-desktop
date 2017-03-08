'use strict'

window.fakeNotifications = {}

window.fakeNotifications.renderNotification = function(options, onclose) {
    var image = document.createElement('img')
    image.className = 'fake-notification-image'
    image.src = options.iconUrl

    var imageHolder = document.createElement('div')
    imageHolder.className = 'fake-notification-image-holder'
    imageHolder.appendChild(image)

    var title = document.createElement('div')
    title.className = 'fake-notification-title'
    title.textContent = options.title

    var message = document.createElement('div')
    message.className = 'fake-notification-message'

    if (options.allItems) {
        options.allItems.forEach(function(item) {
            message.textContent += item.title + ' ' + item.message + '\n'
        })
    } else {
        message.textContent = options.fullMessage
    }

    var contextMessage = document.createElement('div')
    contextMessage.className = 'fake-notification-context-message'
    contextMessage.textContent = options.contextMessage

    var textHolder = document.createElement('div')
    textHolder.className = 'fake-notification-text-holder fake-notification-bottom-border'
    textHolder.onclick = function() {
        if (options.onclick) {
            options.onclick()
        }
        if (onclose) {
            onclose()
        }
    }

    textHolder.appendChild(title)
    textHolder.appendChild(message)
    textHolder.appendChild(contextMessage)

    var buttonsHolder = document.createElement('div')
    if (options.allButtons) {
        options.allButtons.forEach(function(button) {
            buttonsHolder.appendChild(makeButton(button, onclose))
        })
    }

    var div = document.createElement('div')
    div.className = 'fake-notification'
    div.appendChild(imageHolder)
    div.appendChild(textHolder)
    div.appendChild(buttonsHolder)

    if (onclose) {
        var close = document.createElement('img')
        close.src = 'action_cancel.png'
        close.className = 'fake-notification-close'
        close.onclick = onclose
        div.appendChild(close)
    }

    return div
}

var makeButton = function(button, onclose) {
    var image = document.createElement('img')
    image.className = 'fake-notification-button-icon'
    image.src = button.iconUrl
    
    var label = document.createElement('span')
    label.textContent = button.title

    var div = document.createElement('div')
    div.className = 'fake-notification-button fake-notification-bottom-border'
    div.onclick = function() {
        button.onclick()
        if (onclose) {
            onclose()
        }
    }

    div.appendChild(image)
    div.appendChild(label)

    return div
}
