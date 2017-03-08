'use strict';

pb.eventListeners = [];

pb.addEventListener = function(eventName, listener) {
    pb.eventListeners.push({ 'eventName': eventName, 'listener': listener });
    window.addEventListener(eventName, listener, false);
};

pb.removeEventListener = function(eventName, listener) {
    var eventListeners = [];

    pb.eventListeners.forEach(function(eventListener) {
        if (eventListener.eventName == eventName && eventListener.listener == listener) {
            window.removeEventListener(eventName, listener);
        } else {
            eventListeners.push(eventListener);
        }
    });

    pb.eventListeners = eventListeners;
};

pb.clearEventListeners = function() {
    var eventListeners = [];
    var dontRemove = ['signed_in', 'signed_out'];

    pb.eventListeners.forEach(function(eventListener) {
        if (dontRemove.indexOf(eventListener.eventName) == -1) {
            window.removeEventListener(eventListener.eventName, eventListener.listener, false);
        } else {
            eventListeners.push(eventListener);
        }
    });

    pb.eventListeners = eventListeners;
};

pb.dispatchEvent = function(eventName, details) {
    if (window.chrome || window.safari) {
        window.dispatchEvent(new CustomEvent(eventName, { 'detail': details }));
    } else {
        var detail;
        if (pb.browserVersion >= 30) {
            detail = cloneInto({ 'detail': details }, document.defaultView);
        } else {
            detail = { 'detail': details };
        }
        window.dispatchEvent(new CustomEvent(eventName, detail));
    }
};
