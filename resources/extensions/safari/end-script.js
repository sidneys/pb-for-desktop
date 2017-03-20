document.addEventListener('contextmenu', function(e) {
    var userInfo = {
        'selection': window.getSelection().toString(),
        'tagName': e.target.tagName
    };

    if (e.target.tagName == 'IMG') {
        userInfo.src = e.target.src;
    } else if (e.target.tagName == 'A') {
        userInfo.url = e.target.href;
    } else {
        userInfo.title = window.document.title;
        userInfo.url = window.location.href;
    }

    safari.self.tab.setContextMenuEventUserInfo(e, userInfo);
}, false);

if (window.location.href.indexOf('https://www.pushbullet.com') == 0) {
    setInterval(function() {
        if (localStorage.desktop) {
            var apiKey = localStorage.desktop.slice(28,-1);
            safari.self.tab.dispatchMessage('api_key', { 'apiKey': apiKey });
        }
    }, 1000);
}
