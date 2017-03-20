'use strict'

window.onload = function() {
    var params = utils.getParams(location.search)
    var key = params['key']

    chrome.runtime.sendMessage({ 'type': 'more_get_options' }, function(options) {
        options.onclick = function() {
            chrome.runtime.sendMessage({ 'type': 'more_main_click' })
        }

        for (var i = 0; i < options.allButtons.length; i++) {
            (function(index) {
                var button = options.allButtons[index]
                button.onclick = function() {
                    chrome.runtime.sendMessage({ 'type': 'more_button_click', 'index': index })
                }
            })(i)
        }

        document.body.appendChild(fakeNotifications.renderNotification(options))

        var resizeBy = document.body.offsetHeight - window.innerHeight
        if (resizeBy != 0) {
            window.resizeBy(0, resizeBy)
        }
    })
}
