'use strict'

var getHeaders = function() {
    return {
        'X-User-Agent': pb.userAgent,
        'Authorization': 'Bearer ' + pb.local.apiKey,
        'Accept': 'application/json'
    }
}

var onResponse = function(status, body, done) {
    if (status == 200) {
        try {
            done(JSON.parse(body))
        } catch (e) {
            pb.log(e)
            done()
        }
    } else if (status === 401) {
        pb.signOut()
    } else if (status === 400) {
        try {
            done(null, JSON.parse(body).error)
        } catch (e) {
            done()
        }
    } else {
        done()
    }
}

pb.get = function(url, done) {
    pb.log('GET ' + url)

    var xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)

    xhr.timeout = 30000
    xhr.ontimeout = function() {
        onResponse(0, null, done)
    }

    var headers = getHeaders()
    Object.keys(headers).forEach(function(key) {
        xhr.setRequestHeader(key, headers[key])
    })

    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            onResponse(xhr.status, xhr.responseText, done)
        }
    }

    xhr.send()
}

pb.del = function(url, done) {
    pb.log('DELETE ' + url)

    var xhr = new XMLHttpRequest()
    xhr.open('DELETE', url, true)

    xhr.timeout = 30000
    xhr.ontimeout = function() {
        onResponse(0, null, done)
    }

    var headers = getHeaders()
    Object.keys(headers).forEach(function(key) {
        xhr.setRequestHeader(key, headers[key])
    })

    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            onResponse(xhr.status, xhr.responseText, done)
        }
    }

    xhr.send()
}

pb.post = function(url, object, done) {
    pb.log('POST ' + url)

    var xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.setRequestHeader('Content-Type', 'application/json')

    var headers = getHeaders()
    Object.keys(headers).forEach(function(key) {
        xhr.setRequestHeader(key, headers[key])
    })

    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            onResponse(xhr.status, xhr.responseText, done)
        }
    }

    xhr.send(JSON.stringify(object))
}
