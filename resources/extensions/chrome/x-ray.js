'use strict';

window.init = function() {
    var pushes = JSON.stringify(utils.asArray(pb.local.pushes), null, 4);
    document.getElementById('json').innerText = pushes;
};
