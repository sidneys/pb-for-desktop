'use strict'

window.onresize = function() {
    updateBubbleMaxWidth()
}

var lastBubbleMaxWidth
var updateBubbleMaxWidth = function() {
    var maxWidth

    var chatScrolls = document.getElementsByClassName('chat-scroll')
    for (var i = 0; i < chatScrolls.length; i++) {
        var chatScroll = chatScrolls[i]
        maxWidth = chatScroll.clientWidth != 0 ? chatScroll.clientWidth - 92 : maxWidth
    }

    if (maxWidth != lastBubbleMaxWidth) {
        lastBubbleMaxWidth = maxWidth
    
        for (var i = 0; i < document.styleSheets.length; i++) {
            var styleSheet = document.styleSheets[i]
            if (styleSheet.href && styleSheet.href.indexOf('chat-ui.css') != -1) {
                for (var j = 0; j < styleSheet.cssRules.length; j++) {
                    var rule = styleSheet.cssRules[j]
                    if (rule.selectorText == '.chat-bubble') {
                        rule.style.maxWidth = maxWidth + 'px'
                        return
                    }
                }
            }
        }
    }
}

var chatEmptyState = function() {
    var img = document.createElement('img')
    img.src = 'bg_sam.png'

    var p = document.createElement('p')
    p.textContent = chrome.i18n.getMessage('no_pushes')

    var div = document.createElement('div')
    div.id = 'chat-empty-state'
    div.appendChild(img)
    div.appendChild(p)

    return div
}

var chatTimeDivider = function(timestamp) {
    var divider = document.createElement('div')
    divider.className = 'chat-time-divider'

    var now = moment()
    var time = moment(timestamp)
    if (now.diff(timestamp, 'hours') <= 24) {
        divider.textContent = time.calendar()
    } else {
        divider.textContent = time.format('dddd, MMMM Do') + ' at ' + time.format('h:mm a')
    }

    return divider
}
