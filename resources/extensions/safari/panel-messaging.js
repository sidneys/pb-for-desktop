'use strict';

if (!self.port && !window.chrome && !window.safari) {
    throw new Error('Shouldn\'t be here');
}

onFocusChanged = function() {
    if (activeMessagingTab == 'sms') {
        updateActiveSmsChat();
    } else {
        updateActivePushChat();
    }

    if (focused) {
        if (activeMessagingTab != 'sms') {
            pushesLocalsChangedListener();
        }
    } else {
        if (window.safari) {
            onunload();
        }
    }
};

var activeMessagingTab, messagingLeft, messagingRight;

var setUpMessaging = function(tab) {
    messagingLeft = document.getElementById('messaging-content-left');
    messagingRight = document.getElementById('messaging-content-right');

    var pushRight = document.getElementById('push-right');
    var smsRight = document.getElementById('sms-right');

    tearDownMessaging();

    messagingRight.style.display = 'block';

    activeMessagingTab = tab;

    if (activeMessagingTab == 'sms') {
        pushRight.style.display = 'none';
        smsRight.style.display = 'block';

        setUpSmsMessaging();
    } else {
        pushRight.style.display = 'block';
        smsRight.style.display = 'none';

        if (activeMessagingTab == 'devices') {
            setUpPushMessaging('devices');
        } else {
            setUpPushMessaging('people');
        }
    }
};

var tearDownMessaging = function() {
    resetMessagingContent();
    tearDownPushMessaging();
    tearDownSmsMessaging();
};

var resetMessagingContent = function() {
    if (messagingLeft) {
        while (messagingLeft.hasChildNodes()) {
            messagingLeft.removeChild(messagingLeft.lastChild);
        }

        messagingRight.style.display = 'none';
    }
};

var createStreamRow = function(imageUrl, name, description, descriptionCssClass, onPopOutClick) {
    var img = document.createElement('img');
    img.className = 'stream-row-image';
    img.src = imageUrl;

    var content = document.createElement('div');
    content.className = 'stream-row-content';

    var line1 = document.createElement('div');
    line1.className = 'one-line';
    line1.textContent = name;

    content.appendChild(line1);

    if (description) {
        var line2 = document.createElement('div');
        line2.className = 'one-line secondary';
        line2.textContent = description;

        if (descriptionCssClass) {
            line2.classList.add(descriptionCssClass);
        }

        content.appendChild(line2);
    } else {
        line1.style.lineHeight = '36px';
    }

    var div = document.createElement('div');
    div.className = 'stream-row';
    div.appendChild(img);
    div.appendChild(content);

    if (onPopOutClick && !window.safari) {
        var popOutIcon = document.createElement('i');
        popOutIcon.className = 'pushfont-popout';

        var popOut = document.createElement('div');
        popOut.className = 'pop-out-stream';
        popOut.appendChild(popOutIcon);
        popOut.onclick = onPopOutClick;

        div.appendChild(popOut);
    }

    return div;
};

var clearSelectedStream = function() {
    var selectedSet = document.getElementsByClassName('stream-row selected');
    for (var i = 0; i < selectedSet.length; i++) {
        var selected = selectedSet[i];
        selected.classList.remove('selected');
    }
};

var scrollStreamRowIntoViewIfNecessary = function(row) {
    messagingLeft.scrollTop = 0;

    if (row) {
        var index = 0, element = row;
        while ((element = element.previousElementSibling) != null) {
            index++;
        }
        
        if (index > 6) {
            row.scrollIntoView(true);
        }
    }
};
