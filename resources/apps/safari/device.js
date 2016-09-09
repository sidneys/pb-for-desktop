'use strict';

pb.addEventListener('signed_in', function(e) {
    if (localStorage.device) {
        pb.local.device = JSON.parse(localStorage.device);
    }

    pb.addEventListener('devices_ready', function(e) {
        createOrAttachDevice();
    });
});

var inProgress, retryTimeout;
var createOrAttachDevice = function() {
    clearTimeout(retryTimeout);

    if (inProgress) {
        pb.devtools('Device is already being created or attached');
        return;
    } else {
        inProgress = true;
    }

    var attachTo, device;
    Object.keys(pb.local.devices).forEach(function(key) {
        device = pb.local.devices[key];
        if (device.active) {
            if ((pb.local.device && pb.local.device.iden == device.iden)
                || (window.chrome && device.type == 'chrome' && !pb.isOpera)
                || (pb.isOpera && device.type == 'opera')
                || (window.safari && device.type == 'safari')
                || (!window.chrome && !window.safari && device.type == 'firefox')) {
                attachTo = device;
            }
        }
    });

    if (attachTo) {
        if (!pb.local.device) {
            pb.devtools('Attaching to existing device:');
            pb.devtools(attachTo);
        }

        pb.local.device = attachTo;
        localStorage.device = JSON.stringify(attachTo);

        var needsUpdating = false;
        var deviceValues = getDeviceValues();

        if (localStorage['keyFingerprintDirty']) {
            deviceValues['key_fingerprint'] = pb.e2e.getKeyFingerprint();
        }

        Object.keys(deviceValues).forEach(function(key) {
            if (deviceValues[key] != pb.local.device[key]) {
                needsUpdating = true;
            }
        });
        if (needsUpdating) {
           updateDevice(deviceValues, function(response) {
               if (response) {
                    pb.local.device = response;
                    localStorage.device = JSON.stringify(attachTo);
                    localStorage.removeItem('keyFingerprintDirty');
                } else {
                    var retryTimeout = setTimeout(function() {
                         pb.dispatchEvent('devices_ready');
                    }, 30 * 1000);
                }

                inProgress = false;
            });
        } else {
            inProgress = false;
        }
    } else if (pb.local.device && !attachTo) { // Device has been deleted
        inProgress = false;
        pb.signOut();
    } else {
        createDevice(function(response) {
            if (response) {
                pb.local.device = response;
                localStorage.device = JSON.stringify(response);
            } else {
                var retryTimeout = setTimeout(function() {
                     pb.dispatchEvent('devices_ready');
                }, 30 * 1000);
            }

            inProgress = false;
        });
    }
};

var getDeviceValues = function() {
    var body = {};

    if (window.chrome) {
        if (pb.isOpera) {
            body['type'] = 'opera';
            body['manufacturer'] = 'Opera';
            body['model'] = 'Opera';
        } else {
            body['type'] = 'chrome';
            body['manufacturer'] = 'Google';
            body['model'] = 'Chrome';
        }
    } else if (window.safari) {
        body['type'] = 'safari';
        body['manufacturer'] = 'Apple';
        body['model'] = 'Safari';
    } else {
        body['type'] = 'firefox';
        body['manufacturer'] = 'Mozilla';
        body['model'] = 'Firefox';
    }

    return body;
};

var createDevice = function(done) {
    pb.devtools('Creating device');

    var body = getDeviceValues();
    body['nickname'] = window.chrome ? pb.isOpera ? 'Opera' : 'Chrome' : window.safari ? 'Safari' : 'Firefox';
    body['app_version'] = pb.version;

    pb.post(pb.api + '/v2/devices', body, function(response) {
        done(response);
    });
};

var updateDevice = function(deviceValues, done) {
    pb.devtools('Updating device');

    pb.post(pb.api + '/v2/devices/' + pb.local.device.iden, deviceValues, function(response) {
        done(response);
    });
};
