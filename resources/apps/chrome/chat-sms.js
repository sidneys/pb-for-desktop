'use strict'

var updateSmsChat = function(device, thread, messages) {
    drawSmsChat(device, thread, messages)
}

var drawSmsChat = function(device, thread, messages) {
    updateBubbleMaxWidth()

    var chatCell = document.getElementById('sms-chat-cell')
    var chatScroll = document.getElementById('sms-chat-scroll')
    var atBottom = chatScroll.scrollTop == 0 || chatScroll.scrollTop + chatScroll.offsetHeight >= chatScroll.scrollHeight

    while (chatCell.hasChildNodes()) {
        chatCell.removeChild(chatCell.lastChild)
    }

    if (!device || !thread) {
        return
    }

    var latest = messages && messages.length > 0 ? messages[messages.length - 1] : null

    var texts = utils.asArray(pb.local.texts || []).sort(function(a, b) {
        return a.created - b.created
    }).filter(function(text) {
        if (text.data.encrypted) {
            var decrypted = pb.e2e.decrypt(text.data.ciphertext)
            if (decrypted != null) {
                text.data = JSON.parse(decrypted)
            }
        }

        if (text.data.target_device_iden == device.iden) {
            if (thread.recipients.length == text.data.addresses.length && thread.recipients.filter(function(recipient) {
                return text.data.addresses.indexOf(recipient.address) != -1
            }).length == thread.recipients.length) {
                if (!latest || !text.data.timestamp || text.data.timestamp > latest.timestamp) {
                    return true
                }
            }
        }
    })

    var pending = utils.asArray(pb.successfulSms).concat(pb.smsQueue).filter(function(pending) {
        if (pending.target_device_iden != device.iden) {
            return false
        }

        if (thread.recipients.length == pending.addresses.length && thread.recipients.filter(function(recipient) {
            return pending.addresses.indexOf(recipient.address) != -1
        }).length != thread.recipients.length) {
            return false
        }

        for (var i = 0; i < texts.length; i++) {
            var text = texts[i]
            if (text.data.guid == pending.guid) {
                return false
            }
        }

        return true
    }).concat(pb.fileQueue.filter(function(data) {
        return data.type == 'sms'
               && data.addresses.length == data.addresses.length
               && thread.recipients.length == data.addresses.length
               && thread.recipients.filter(function(recipient) {
                    return data.addresses.indexOf(recipient.address) != -1
                }).length == thread.recipients.length
    }))

    messages = (messages || []).concat(texts.map(function(text) {
        return {
            'iden': text.iden,
            'body': text.data.message,
            'direction': 'outgoing',
            'status': text.data.status || 'queued',
            'type': 'sms',
            'addresses': text.data.addresses,
            'file_url': text.file_url,
            'guid': text.data.guid,
            'created': text.created
        }
    })).concat(pending)

    if (messages.length == 0) {
        chatCell.appendChild(chatEmptyState())
        return
    }

    var chunks = chunkifySms(thread, messages)

    chatCell.appendChild(renderSmsChunks(thread, chunks))

    if (atBottom) {
        scrollSmsChat()
    }
}

var scrollSmsChat = function() {
    var chatScroll = document.getElementById('sms-chat-scroll')
    chatScroll.scrollTop = chatScroll.scrollHeight
}

var chunkifySms = function(thread, messages) {
    var chunks = [], chunk = [], previous

    var nextChunk = function(message) {
        chunks.push(chunk)
        chunk = []
        chunk.push(message)
    }

    messages.forEach(function(message) {
        if (!previous) {
            chunk.push(message)
        } else if (message.direction == previous.direction && message.recipient_index == previous.recipient_index) {
            chunk.push(message)
        } else {
            nextChunk(message)
        }

        previous = message
    })

    chunks.push(chunk)

    return chunks
}

var renderSmsChunks = function(thread, chunks) {
    var fragment = document.createDocumentFragment()

    var chatScroll = document.getElementById('sms-chat-scroll')

    var isOnLeft = function(message) {
        return message.direction == 'incoming'
    }

    var previousMessage
    var lastChunk = chunks[chunks.length - 1]
    chunks.forEach(function(chunk) {
        var chunkHolder = document.createElement('div')
        chunkHolder.className = 'chunk-holder'

        var lastMessage = chunk[chunk.length - 1]
        chunk.forEach(function(message) {
            if (!previousMessage || message.timestamp - previousMessage.timestamp > 15 * 60) {
                chunkHolder.appendChild(chatTimeDivider(Math.floor(message.timestamp ? Math.min(message.timestamp * 1000, Date.now()) : Date.now())))
            }

            var onLeft = isOnLeft(message)

            var row = document.createElement('div')
            row.className = 'chat-row'

            var contents = document.createElement('div')
            contents.className = 'chat-bubble-contents'

            if (message.image_urls) {
                var maxWidth = 192
                message.image_urls.forEach(function(imageUrl) {
                    var img = document.createElement('img')
                    img.className = 'chat-image'
                    img.style.maxWidth = maxWidth + 'px'
                    img.style.height = maxWidth + 'px'
                    img.src = imageUrl

                    img.onclick = function() {
                        window.open(imageUrl)
                    }

                    img.onload = function() {
                        if (img.width == maxWidth) {
                            img.style.height = 'auto'
                        }

                        if (chatScroll.scrollTop != 0) {
                            chatScroll.scrollTop += contents.offsetHeight
                        }
                    }

                    img.onerror = function() {
                        img.style.display = 'none'
                    }

                    contents.appendChild(img)
                })
            }

            if (message.body) {
                var p = document.createElement('p')
                p.className = 'chat-body'
                utils.linkify(message.body, p)
                contents.appendChild(p)
            }

            if (message.file || message.file_url) {
                var maxWidth = 192

                var img = document.createElement('img')
                img.className= 'chat-image'
                img.style.maxWidth = maxWidth + 'px'

                if (message.file_url) {
                    img.src = message.file_url
                } else {
                    if (!message.dataUrl) {
                        var reader = new FileReader()
                        reader.readAsDataURL(message.file)
                        reader.onload = function() {
                            message.dataUrl = reader.result
                            img.src = message.dataUrl
                        }
                    } else {
                        img.src = message.dataUrl
                    }
                }

                img.onload = function() {
                    if (img.width == maxWidth) {
                        img.style.height = 'auto'
                    }

                    if (chatScroll.scrollTop != 0) {
                        chatScroll.scrollTop += contents.offsetHeight
                    }
                }

                img.onerror = function() {
                    img.style.display = 'none'
                }

                contents.appendChild(img)
            }

            if (message.progress && message.progress < 1) {
                var progressBar = document.createElement('div')
                progressBar.className = 'chat-progress-bar'

                var progressBarFill = document.createElement('div')
                progressBarFill.className = 'chat-progress-bar-fill'
                progressBarFill.style.width = (message.progress * 100) + '%'

                progressBar.appendChild(progressBarFill)

                contents.appendChild(progressBar)
            }

            var bubble = document.createElement('div')
            bubble.className = 'chat-bubble sms'
            bubble.appendChild(contents)

            if (message.id) {
                bubble.setAttribute('data-message-id', message.id)
            }

            if (onLeft) {
                bubble.classList.add('left')
            }

            row.appendChild(bubble)

            if (message == lastMessage) {
                var thumbnail = document.createElement('img')
                thumbnail.className = 'chat-thumbnail'

                if (message.direction == 'incoming') {
                    if (thread.recipients.length == 1) {
                        var recipient = thread.recipients[0]
                        if (recipient.image_url) {
                            thumbnail.src = recipient.image_url
                        } else if (recipient.thumbnail) {
                            thumbnail.src = 'data:image/jpeg;base64,' + recipient.thumbnail
                        } else {
                            thumbnail.src = 'chip_person.png'
                        }
                        thumbnail.title = recipient.name
                    } else if ('recipient_index' in message) {
                        var recipient = thread.recipients[message.recipient_index]
                        if (recipient.image_url) {
                            thumbnail.src = recipient.image_url
                        } else if (recipient.thumbnail) {
                            thumbnail.src = 'data:image/jpeg;base64,' + recipient.thumbnail
                        } else {
                            thumbnail.src = 'chip_person.png'
                        }
                        thumbnail.title = recipient.name
                    } else {
                        thumbnail.src = 'chip_person.png'
                    }
                } else {
                    thumbnail.src = utils.streamImageUrl(pb.local.user)
                    thumbnail.title = pb.local.user && pb.local.user.name
                }

                if (onLeft) {
                    thumbnail.classList.add('left')
                }

                row.appendChild(thumbnail)

                var poker = document.createElement('div')
                poker.className = 'chat-poker sms'

                if (onLeft) {
                    poker.classList.add('left')
                    poker.innerHTML = '<svg><polygon points="12,0 0,10 12,10"></svg>'
                } else {
                    poker.innerHTML = '<svg><polygon points="0,0 12,10 0,10"></svg>'
                }

                if (message.status) {
                    poker.classList.add(message.status)
                }

                row.appendChild(poker)
            }

            if (message.status) {
                row.classList.add(message.status)
                bubble.classList.add(message.status)

                if (message.iden && !pb.successfulSms[message.guid]) {
                    var cancel = document.createElement('i')
                    cancel.className = 'chat-delete pushfont-close'
                    cancel.onclick = function() {
                        pb.deleteText(message.iden)
                    }
                    row.appendChild(cancel)
                }
            }

            chunkHolder.appendChild(row)

            previousMessage = message
        })

        if (chunk == lastChunk && previousMessage != null) {
            var div = document.createElement('div')
            div.className = 'chat-date'

            if (previousMessage.status && previousMessage.status == 'queued') {
                var span = document.createElement('span')
                span.textContent = chrome.i18n.getMessage('pending')
                div.appendChild(span)

                if (previousMessage.created && (Date.now() / 1000) - previousMessage.created > 30) {
                    var span2 = document.createElement('span')
                    span2.textContent = ' - '
                    div.appendChild(span2)

                    var link = document.createElement('a')
                    link.target = '_blank'
                    link.href = 'https://help.pushbullet.com/articles/why-are-my-text-messages-stuck-pending/'
                    link.textContent = chrome.i18n.getMessage('stuck_pending')
                    div.appendChild(link)
                }
            } else {
                var timestamp = Math.floor(previousMessage.timestamp ? Math.min(previousMessage.timestamp * 1000, Date.now()) : Date.now())
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

            if (isOnLeft(previousMessage)) {
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
