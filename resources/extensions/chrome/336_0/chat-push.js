'use strict'

var initialUpdatePushChat = true
var updatePushChat = function(stream) {
    drawPushChat(stream)
}

var drawPushChat = function(stream) {
    updateBubbleMaxWidth()

    var pushes = filterAndSortPushes(stream)

    var chatCell = document.getElementById('push-chat-cell')
    var chatScroll = document.getElementById('push-chat-scroll')
    var atBottom = chatScroll.scrollTop == 0 || chatScroll.scrollTop + chatScroll.offsetHeight + 16 >= chatScroll.scrollHeight

    while (chatCell.hasChildNodes()) {
        chatCell.removeChild(chatCell.lastChild)
    }

    var historyLink = pb.www
    if (stream.with) {
        historyLink += '/#people/' + stream.with.email_normalized
    } else if (stream.tag) {
        historyLink += '/#following/' + stream.tag
    } else if (stream.client_iden) {
        historyLink += '/#following/' + stream.client_iden
    } else {
        historyLink += '/#people/me/'
    }

    chatCell.appendChild(seeFullHistory(historyLink))

    if (!pushes || pushes.length == 0) {
        chatCell.appendChild(chatEmptyState())
        return
    }

    var chunks = chunkifyPushes(pushes)

    chatCell.appendChild(renderPushChunks(chunks))

    if (atBottom) {
        scrollPushChat()
    }
}

var scrollPushChat = function() {
    var chatScroll = document.getElementById('push-chat-scroll')
    chatScroll.scrollTop = chatScroll.scrollHeight
}

var seeFullHistory = function(historyLink) {
    var a = document.createElement('a')
    a.target = '_blank'
    a.href = historyLink
    a.textContent = chrome.i18n.getMessage('see_full_history')

    var div = document.createElement('div')
    div.style.textAlign = 'center'
    div.style.margin = '10px'
    div.appendChild(a)

    return div
}

var filterAndSortPushes = function(stream) {
    if (!pb.local.pushes) {
        return
    }

    var pushesFilter = function(push) {
        if (stream.with) {
            return push.sender_email_normalized == stream.with.email_normalized
                   || push.receiver_email_normalized == stream.with.email_normalized
                   || push.email == stream.with.email_normalized
        } else if (stream.tag) {
            return push.channel_iden == stream.iden
                   || push.channel_tag == stream.tag
        } else {
            if (stream.iden == '*') {
                return (push.direction == 'self' && !push.client_iden)
                       || (!push.direction && !push.email && !push.channel_tag)
            } else {
                return (push.direction == 'self' && !push.client_iden && (push.source_device_iden == stream.iden || push.stream_device_iden == stream.iden || push.target_device_iden == stream.iden))
                       || (!push.direction && !push.email && !push.channel_tag && push.device_iden == stream.iden)
            }
        }

        return push
    }

    var pushes = utils.asArray(pb.local.pushes).sort(function(a, b) {
        return a.created - b.created
    }).filter(pushesFilter)

    var pendingPushes = utils.asArray(pb.successfulPushes).concat(pb.pushQueue).filter(function(pending) {
        for (var i = 0; i < pushes.length; i++) {
            var push = pushes[i]
            if (pending.guid == push.guid) {
                return false
            }
        }
        return true
    })

    pushes = pushes.concat(pendingPushes).concat(pb.fileQueue.filter(function(data) {
        return data.type != 'sms'
    })).concat(pb.failedPushes).filter(pushesFilter)

    var modified = false
    pushes.forEach(function(push) {
        if (pb.awake && focused && push.direction == 'incoming') {
            if (!push.dismissed) {
                pb.markDismissed(push)
            } else if (push.awake_app_guids && push.awake_app_guids.indexOf('extension-' + localStorage.client_id) != -1) {
                delete push.awake_app_guids
                modified = true
                pb.notifier.dismiss(pb.groupKey(push))
            }
        }
    })

    if (modified) {
        pb.savePushes()
    }

    return pushes
}

var chunkifyPushes = function(pushes) {
    var chunks = [], chunk = [], previous

    var nextChunk = function(push) {
        chunks.push(chunk)
        chunk = []
        chunk.push(push)
    }

    pushes.forEach(function(push) {
        if (!previous) {
            chunk.push(push)
        } else if (push.direction == 'self') {
            if (!push.client_iden) {
                var hasSource = !!push.source_device_iden
                var hasTarget = !!push.target_device_iden
                var previousHasSource = !!previous.source_device_iden
                var previousHasTarget = !!previous.target_device_iden
                var sourcesMatch = push.source_device_iden == previous.source_device_iden
                var targetsMatch = push.target_device_iden == previous.target_device_iden

                if (previous.client_iden) {
                    nextChunk(push)
                } else if (!hasSource && !previousHasSource && !hasTarget && !previousHasTarget) {
                    chunk.push(push)
                } else if (hasSource && !hasTarget && !previousHasTarget && sourcesMatch) {
                    chunk.push(push)
                } else if (hasTarget && !hasSource && !previousHasSource && targetsMatch) {
                    chunk.push(push)
                } else if (hasSource && sourcesMatch && hasTarget && targetsMatch) {
                    chunk.push(push)
                } else {
                    nextChunk(push)
                }
            } else {
                if (push.client_iden == previous.client_iden) {
                    chunk.push(push)
                } else {
                    nextChunk(push)
                }
            }
        } else if (push.direction == 'incoming') {
            if (push.channel_iden && push.channel_iden == previous.channel_iden) {
                chunk.push(push)
            } else if (push.sender_email_normalized && push.sender_email_normalized == previous.sender_email_normalized) {
                chunk.push(push)
            } else {
                nextChunk(push)
            }
        } else if (push.direction == 'outgoing') {
            if (push.receiver_email_normalized && push.receiver_email_normalized == previous.receiver_email_normalized) {
                chunk.push(push)
            } else {
                nextChunk(push)
            }
        } else {
            if (push.email == previous.email) {
                chunk.push(push)
            } else if (push.email == previous.receiver_email_normalized && previous.direction != 'incoming') {
                chunk.push(push)
            } else if (push.device_iden && push.device_iden == previous.device_iden) {
                chunk.push(push)
            } else if (push.device_iden && push.device_iden == previous.target_device_iden) {
                chunk.push(push)
            } else {
                nextChunk(push)
            }
        }

        previous = push
    })

    chunks.push(chunk)

    return chunks
}

var loadedPushImages = {}
var renderPushChunks = function(chunks) {
    var fragment = document.createDocumentFragment()

    var chatScroll = document.getElementById('push-chat-scroll')

    var isOnLeft = function(push) {
        return push.direction == 'incoming'
                || push.client_iden
                || (push.direction == 'self' && pb.local.device && push.source_device_iden != pb.local.device.iden)
    }

    var previousPush
    var lastChunk = chunks[chunks.length - 1]
    chunks.forEach(function(chunk) {
        var chunkHolder = document.createElement('div')
        chunkHolder.className = 'chunk-holder'

        var lastPush = chunk[chunk.length - 1]
        chunk.forEach(function(push) {
            if (!previousPush || push.created - previousPush.created > 15 * 60) {
                chunkHolder.appendChild(chatTimeDivider(Math.floor(push.created ? Math.min(push.created * 1000, Date.now()) : Date.now())))
            }

            var onLeft = isOnLeft(push)

            var row = document.createElement('div')
            row.className = 'chat-row'

            var contents = document.createElement('div')
            contents.className = 'chat-bubble-contents'

            if (push.title) {
                var pTitle = document.createElement('p')
                pTitle.className = 'chat-title'
                pTitle.textContent = push.title
                contents.appendChild(pTitle)
            }

            if (push.body) {
                var pBody = document.createElement('p')
                pBody.className = 'chat-body'
                utils.linkify(push.body, pBody)
                contents.appendChild(pBody)
            }

            if (push.image_url|| (push.file && ['image/gif', 'image/png', 'image/jpg', 'image/jpeg'].indexOf(push.file.type) != -1)) {
                var maxWidth = 192

                var img = document.createElement('img')
                img.className= 'chat-image'
                img.style.maxWidth = maxWidth + 'px'

                if (push.file) {
                    if (!push.imgElement) {
                        var reader = new FileReader()
                        reader.readAsDataURL(push.file)
                        reader.onload = function() {
                            push.dataUrl = reader.result
                            img.src = push.dataUrl
                            push.imgElement = img
                        }
                    } else {
                        img = push.imgElement
                    }
                } else {
                    if (push.image_url.indexOf('googleusercontent') != -1 || push.image_url.indexOf('ggpht') != -1) {
                        var resizeTo = maxWidth
                        if (push.image_width && push.image_height) {
                            if (push.image_width > maxWidth) {
                                var factor = maxWidth / push.image_width
                                var scaledWidth = Math.round(factor * push.image_width)
                                var scaledHeight = Math.round(factor * push.image_height)
                                resizeTo = Math.max(scaledWidth, scaledHeight)

                                img.style.width = scaledWidth + 'px'
                                img.style.height = scaledHeight + 'px'
                            } else {
                                img.style.width = push.image_width + 'px'
                                img.style.height = push.image_height + 'px'
                            }
                        } else {
                            img.style.height = maxWidth + 'px'
                        }

                        img.src = push.image_url + '=s' + resizeTo
                    } else {
                        img.src = push.image_url
                    }

                    img.onclick = function() {
                        window.open(push.file_url)
                    }
                }
                
                if (!loadedPushImages[img.src]) {
                    img.onload = function() {
                        loadedPushImages[img.src] = true

                        if (img.width == maxWidth) {
                            img.style.height = 'auto'
                        }

                        if (chatScroll.scrollTop != 0) {
                            chatScroll.scrollTop += contents.offsetHeight
                        }
                    }
                }

                img.onerror = function() {
                    img.style.display = 'none'
                }

                contents.appendChild(img)
            } else {
                var url = push.url || push.file_url
                if (url) {
                    var a = document.createElement('a')
                    a.className = 'chat-url'
                    a.href = url
                    a.target = '_blank'
                    a.textContent = push.file_name || url

                    if (onLeft) {
                        a.classList.add('left')
                    }

                    contents.appendChild(a)
                } else if (push.file) {
                    var p = document.createElement('p')
                    p.textContent = push.file.name

                    contents.appendChild(p)
                }
            }

            if (push.progress && push.progress < 1) {
                var progressBar = document.createElement('div')
                progressBar.className = 'chat-progress-bar'

                var progressBarFill = document.createElement('div')
                progressBarFill.className = 'chat-progress-bar-fill'
                progressBarFill.style.width = (push.progress * 100) + '%'

                progressBar.appendChild(progressBarFill)

                contents.appendChild(progressBar)
            }

            var bubble = document.createElement('div')
            bubble.className = 'chat-bubble'
            bubble.appendChild(contents)

            bubble.setAttribute('data-push-iden', push.iden)

            if (onLeft) {
                bubble.classList.add('left')
            }

            if (push.failed) {
                bubble.classList.add('failed')

                var errorMessage
                if (push.error && push.error.message.indexOf('too big') != -1) {
                    errorMessage = document.createElement('a')
                    errorMessage.className = 'fail-message'
                    errorMessage.textContent = chrome.i18n.getMessage('file_too_big')
                    errorMessage.onclick = function() {
                        pb.openTab('https://help.pushbullet.com/articles/is-there-a-file-size-limit/')
                    }
                } else {
                    errorMessage = document.createElement('span')
                    errorMessage.className = 'fail-message'
                    errorMessage.textContent = chrome.i18n.getMessage('send_failed')
                }

                var retry = document.createElement('a')
                retry.className = 'fail-button'
                retry.textContent = chrome.i18n.getMessage('retry')
                retry.onclick = function() {
                    delete push.failed
                    delete push.error
                    pb.sendPush(push)
                }

                var clear = document.createElement('a')
                clear.className = 'fail-button'
                clear.textContent = chrome.i18n.getMessage('clear')
                clear.onclick = function() {
                    pb.clearFailed(push)
                }

                var failed = document.createElement('div')
                failed.appendChild(errorMessage)
                failed.appendChild(retry)
                failed.appendChild(clear)

                contents.appendChild(failed)
            }

            row.appendChild(bubble)

            if (push.file) {
                var cancel = document.createElement('i')
                cancel.className = 'chat-delete pushfont-close'
                cancel.onclick = function() {
                    pb.cancelUpload(push)
                }

                row.appendChild(cancel)
            }

            if (push == lastPush) {
                var thumbnail = document.createElement('img')
                thumbnail.className = 'chat-thumbnail'

                var stream = findStream(push)

                thumbnail.src = utils.streamImageUrl(stream)
                thumbnail.title = utils.streamDisplayName(stream)

                if (onLeft) {
                    thumbnail.classList.add('left')
                }

                row.appendChild(thumbnail)

                var poker = document.createElement('div')
                poker.className = 'chat-poker'

                if (onLeft) {
                    poker.classList.add('left')
                    poker.innerHTML = '<svg><polygon points="12,0 0,10 12,10"></svg>'
                } else {
                    poker.innerHTML = '<svg><polygon points="0,0 12,10 0,10"></svg>'
                }

                if (push.failed) {
                    poker.classList.add('failed')
                }

                row.appendChild(poker)
            }

            chunkHolder.appendChild(row)

            previousPush = push
        })

        if (chunk == lastChunk && previousPush != null) {
            var div = document.createElement('div')
            div.className = 'chat-date'

            if (previousPush.queued && !previousPush.failed) {
                div.textContent = chrome.i18n.getMessage('sending')
            } else {
                var timestamp = Math.floor(previousPush.created ? Math.min(previousPush.created * 1000, Date.now()) : Date.now())
                var created = moment(timestamp)
                if (Date.now() - created > 5 * 60 * 1000) {
                    var dateText
                    if (Date.now() - created > 24 * 60 * 60 * 1000) {
                        dateText = created.format('ll')
                    } else {
                        dateText = created.fromNow()
                    }

                    div.textContent = dateText
                } else {
                    div.textContent = chrome.i18n.getMessage('now')
                }
            }

            if (isOnLeft(previousPush)) {
                div.style.marginLeft = '50px'
            } else {
                div.style.textAlign = 'right'
                div.style.marginRight = '50px'
            }

            chunkHolder.appendChild(div)
        }

        fragment.appendChild(chunkHolder)
    })

    return fragment
}

var findStream = function(push) {
    var stream

    if (push.direction == 'incoming') {
        if (push.channel_iden) {
            Object.keys(pb.local.subscriptions).forEach(function(iden) {
                var subscription = pb.local.subscriptions[iden]
                if (push.channel_iden == subscription.channel.iden) {
                    stream = subscription
                }
            })
        } else {
            Object.keys(pb.local.chats).forEach(function(iden) {
                var chat = pb.local.chats[iden]
                if (push.sender_email_normalized == chat.with.email_normalized) {
                    stream = chat
                }
            })
        }
    } else if (push.direction == 'outgoing') {
        return pb.local.user
    } else {
        if (push.email) {
            return pb.local.user
        } else if (push.channel_tag) {
            return pb.local.user
        } else {
            var device = pb.local.devices[push.source_device_iden]
            return device || pb.local.user
        }
    }

    return stream
}
