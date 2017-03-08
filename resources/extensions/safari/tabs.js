'use strict';

var tabOnOpen = {};
var tabOnClose = {};

pb.getActiveTab = function(done) {
    if (window.chrome) {
        chrome.tabs.query({ 'active': true, 'lastFocusedWindow': true }, function(tabs) {
            var tab = tabs[0];
            done(tab);
        });
    } else if (window.safari) {
        var activeTab = safari.application.activeBrowserWindow.activeTab;
        done({
            'title': activeTab.title,
            'url': activeTab.url
        });
    }
};

pb.openTab = function(url) {
    openTab(url);
};

var openTab = function(url) {
    if (window.chrome) {
        chrome.windows.getCurrent({ 'populate': false }, function(current) {
            if (current) {
                chrome.tabs.create({ 'url': url, 'active': true }, function(tab) {
                    chrome.windows.update(tab.windowId, { 'focused': true });
                });
            } else {
                chrome.windows.create({ 'url': url, 'type': 'normal', 'focused': true });
            }
        });
    } else if (window.safari) {
        var newTab;
        if (safari.application.browserWindows.length > 0) {
            if (safari.application.activeBrowserWindow) {
                newTab = safari.application.activeBrowserWindow.openTab();
            } else {
                newTab = safari.application.openBrowserWindow().activeTab;
            }
        } else {
            newTab = safari.application.openBrowserWindow().activeTab;
        }

        newTab.url = url;
    } else {
        var tabId = Date.now();
        self.port.emit('open_tab', { 'id': tabId, 'url': url });
    }
};
