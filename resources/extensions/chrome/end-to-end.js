'use strict'

pb.e2e = {}

pb.addEventListener('signed_in', function(e) {
    pb.e2e.init()
})

pb.addEventListener('signed_out', function(e) {
    pb.e2e.setPassword(null)
})

pb.e2e.setPassword = function(password) {
    if (password && pb.local.user) {
        if (!pb.e2e.key || password != btoa(pb.e2e.key)) {
            localStorage['e2eKey'] = btoa(forge.pkcs5.pbkdf2(password, pb.local.user.iden, 30000, 32, forge.md.sha256.create()))
        }
    } else {
        localStorage.removeItem('e2eKey')
    }

    localStorage['keyFingerprintDirty'] = true

    pb.e2e.init()
    pb.dispatchEvent('devices_ready')
    pb.dispatchEvent('locals_changed')

    pb.successfulSms = {}
}

pb.e2e.getKeyFingerprint = function() {
    if (!pb.e2e.enabled) {
        return null
    }

    var md = forge.md.sha256.create()
    md.update(pb.e2e.key)
    return forge.util.encode64(md.digest().getBytes())
}

pb.e2e.init = function() {
    var key = localStorage['e2eKey']
    if (key) {
        pb.e2e.key = atob(localStorage['e2eKey'])
        pb.e2e.enabled = true
    } else {
        pb.e2e.key = null
        pb.e2e.enabled = false
    }

    pb.notifier.dismiss('e2e')
}

pb.e2e.optEncrypt = function(plaintext) {
    if (pb.e2e.enabled) {
        return pb.e2e.encrypt(plaintext)
    }

    return plaintext
}

pb.e2e.encrypt = function(plaintext) {
    if (!plaintext) {
        return null
    }

    var bytes = forge.util.createBuffer(forge.util.encodeUtf8(plaintext))
    var iv = forge.random.getBytes(12)

    var cipher = forge.cipher.createCipher('AES-GCM', pb.e2e.key)
    cipher.start({ 'iv': iv })
    cipher.update(bytes)
    cipher.finish()

    var output = forge.util.createBuffer()
    output.putBytes('1')
    output.putBytes(cipher.mode.tag.getBytes())
    output.putBytes(iv)
    output.putBytes(cipher.output.getBytes())

    return forge.util.encode64(output.getBytes())
}

pb.e2e.decrypt = function(encrypted) {
    if (!encrypted) {
        return null
    }

    if (!pb.e2e.enabled) {
        pb.e2e.showErrorNotification('encryption_password_needed_title', 'encryption_password_needed_body')
        return null
    }

    try {
        var bytes = forge.util.decode64(encrypted)

        var buffer = forge.util.createBuffer(bytes)
        buffer.getBytes(1)
        var tag = buffer.getBytes(16)
        var iv = buffer.getBytes(12)

        var decipher = forge.cipher.createDecipher('AES-GCM', pb.e2e.key)
        decipher.start({
            'iv': iv,
            'tag': tag
        })
        decipher.update(buffer)
        decipher.finish()

        return decipher.output.toString('utf8')
    } catch (e) {
        pb.e2e.showErrorNotification('encryption_password_needed_title', 'encryption_password_needed_body')
        return null
    }
}

pb.e2e.showErrorNotification = function(title, body) {
    var options = {
        'type': 'basic',
        'key': 'e2e',
        'title': chrome.i18n.getMessage(title),
        'message': chrome.i18n.getMessage(body),
        'contextMessage': 'Pushbullet',
        'iconUrl': 'lock.png',
        'onclick': function() {
            pb.openTab(chrome.extension.getURL('options.html#advanced'))
        }
    }

    if (!pb.notifier.active[options.key]) {
        pb.notifier.show(options)
    }
}
