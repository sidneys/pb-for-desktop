'use strict';

var textMappings = {
    'changelog-tab': 'changelog_tab'
};

window.init = function() {
    Object.keys(textMappings).forEach(function(key) {
        document.getElementById(key).textContent = text.get(textMappings[key]); 
    });

    document.getElementById('logo-link').href = pb.www;

    pb.track({
        'name': 'goto',
        'url': '/changelog'
    });
};
