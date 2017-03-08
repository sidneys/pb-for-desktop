'use strict';

if (!self.port && !window.chrome && !window.safari) {
    throw new Error('Shouldn\'t be here');
}

var updateSmsChat = function(thread, messages) {
    drawSmsChat(thread, messages);
};

var drawSmsChat = function(thread, messages) {
    updateBubbleMaxWidth();

    var chatCell = document.getElementById('sms-chat-cell');
    var chatScroll = document.getElementById('sms-chat-scroll');
    var atBottom = chatScroll.scrollTop == 0 || chatScroll.scrollTop + chatScroll.offsetHeight >= chatScroll.scrollHeight;

    while (chatCell.hasChildNodes()) {
        chatCell.removeChild(chatCell.lastChild);
    }

    if (!thread) {
        return;
    }

    if (!messages || messages.length == 0) {
        chatCell.appendChild(chatEmptyState());
        return;
    }

    var chunks = chunkifySms(thread, messages);

    chatCell.appendChild(renderSmsChunks(thread, chunks));

    if (atBottom) {
        scrollSmsChat();
    }
};

var scrollSmsChat = function() {
    var chatScroll = document.getElementById('sms-chat-scroll');
    chatScroll.scrollTop = chatScroll.scrollHeight;
};

var chunkifySms = function(thread, messages) {
    var chunks = [], chunk = [], previous;

    var nextChunk = function(message) {
        chunks.push(chunk);
        chunk = [];
        chunk.push(message);
    };

    messages.forEach(function(message) {
        if (!previous) {
            chunk.push(message);
        } else if (message.direction == previous.direction && message.recipient_index == previous.recipient_index) {
            chunk.push(message);
        } else {
            nextChunk(message);
        }

        previous = message;
    });

    chunks.push(chunk);

    return chunks;
};

var renderSmsChunks = function(thread, chunks) {
    var fragment = document.createDocumentFragment();

    var chatScroll = document.getElementById('sms-chat-scroll');

    var isOnLeft = function(message) {
        return message.direction == 'incoming';
    };

    var previousMessage;
    var lastChunk = chunks[chunks.length - 1];
    chunks.forEach(function(chunk) {
        var chunkHolder = document.createElement('div');
        chunkHolder.className = 'chunk-holder';

        var lastMessage = chunk[chunk.length - 1];
        chunk.forEach(function(message) {
            if (!previousMessage || message.timestamp - previousMessage.timestamp > 15 * 60) {
                chunkHolder.appendChild(chatTimeDivider(Math.floor(message.timestamp ? Math.min(message.timestamp * 1000, Date.now()) : Date.now())));
            }

            var onLeft = isOnLeft(message);

            var row = document.createElement('div');
            row.className = 'chat-row';

            var contents = document.createElement('div');
            contents.className = 'chat-bubble-contents';

            if (message.image_urls) {
                var maxWidth = 192;
                message.image_urls.forEach(function(imageUrl) {
                    var img = document.createElement('img');
                    img.className = 'chat-image';
                    img.style.maxWidth = maxWidth + 'px';
                    img.style.height = maxWidth + 'px';
                    img.src = imageUrl;

                    img.onclick = function() {
                        window.open(imageUrl);
                    };

                    img.onload = function() {
                        if (img.width == maxWidth) {
                            img.style.height = 'auto';
                        }

                        if (chatScroll.scrollTop != 0) {
                            chatScroll.scrollTop += contents.offsetHeight;
                        }
                    };

                    img.onerror = function() {
                        img.style.display = 'none';
                    };

                    contents.appendChild(img);
                });
            }

            if (message.body) {
                var p = document.createElement('p');
                p.className = 'chat-body';
                utils.linkify(message.body, p);
                contents.appendChild(p);
            }

            var bubble = document.createElement('div');
            bubble.className = 'chat-bubble sms';
            bubble.appendChild(contents);

            bubble.setAttribute('data-message-id', message.id);

            if (onLeft) {
                bubble.classList.add('left');
            }

            if (message.status && message.status == 'failed') {
                bubble.classList.add('failed');

                var errorMessage = document.createElement('span');
                errorMessage.className = 'fail-message';
                errorMessage.textContent = text.get('send_failed');

                var failed = document.createElement('div');
                failed.appendChild(errorMessage);

                if (message.device_iden) {
                    var retry = document.createElement('a');
                    retry.className = 'fail-button';
                    retry.textContent = text.get('retry');
                    retry.onclick = function() {
                        postedSms[message.guid].status = 'queued';
                        postedSms[message.guid].timestamp = Date.now();
                        pb.sendSms(message.device_iden, message.thread_id, message.addresses, message.body, message.guid);
                    };

                    var clear = document.createElement('a');
                    clear.className = 'fail-button';
                    clear.textContent = text.get('clear');
                    clear.onclick = function() {
                        delete postedSms[message.guid];
                        pb.dispatchEvent('locals_changed');
                    };

                    failed.appendChild(retry);
                    failed.appendChild(clear);
                }

                contents.appendChild(failed);
            }

            row.appendChild(bubble);

            if (message == lastMessage) {
                var thumbnail = document.createElement('img');
                thumbnail.className = 'chat-thumbnail';

                if (message.direction == 'incoming') {
                    if (thread.recipients.length == 1) {
                        var recipient = thread.recipients[0];
                        if (recipient.image_url) {
                            thumbnail.src = recipient.image_url;
                        } else if (recipient.thumbnail) {
                            thumbnail.src = 'data:image/jpeg;base64,' + recipient.thumbnail;
                        } else {
                            thumbnail.src = 'chip_person.png';
                        }
                        thumbnail.title = recipient.name;
                    } else if ('recipient_index' in message) {
                        var recipient = thread.recipients[message.recipient_index];
                        if (recipient.image_url) {
                            thumbnail.src = recipient.image_url;
                        } else if (recipient.thumbnail) {
                            thumbnail.src = 'data:image/jpeg;base64,' + recipient.thumbnail;
                        } else {
                            thumbnail.src = 'chip_person.png';
                        }
                        thumbnail.title = recipient.name;
                    } else {
                        thumbnail.src = 'chip_person.png';
                    }
                } else {
                    thumbnail.src = utils.streamImageUrl(pb.local.user);
                    thumbnail.title = pb.local.user.name;
                }

                if (onLeft) {
                    thumbnail.classList.add('left');
                }

                row.appendChild(thumbnail);

                var poker = document.createElement('div');
                poker.className = 'chat-poker sms';

                if (onLeft) {
                    poker.classList.add('left');
                    poker.innerHTML = '<svg><polygon points="12,0 0,10 12,10"></svg>';
                } else {
                    poker.innerHTML = '<svg><polygon points="0,0 12,10 0,10"></svg>';
                }

                if (message.status && message.status == 'failed') {
                    poker.classList.add('failed');
                }

                row.appendChild(poker);
            }

            chunkHolder.appendChild(row);

            previousMessage = message;
        });

        if (chunk == lastChunk && previousMessage != null) {
            var div = document.createElement('div');
            div.className = 'chat-date';

            if (previousMessage.status && previousMessage.status == 'queued') {
                div.textContent = text.get('sending');
            } else {
                var timestamp = Math.floor(previousMessage.timestamp ? Math.min(previousMessage.timestamp * 1000, Date.now()) : Date.now());
                var created = moment(timestamp);
                if (Date.now() - created > 5 * 60 * 1000) {
                    var dateText;
                    if (Date.now() - created > 24 * 60 * 60 * 1000) {
                        dateText = created.format('ll');
                    } else {
                        dateText = created.fromNow();
                    }

                    div.textContent = dateText;
                } else {
                    div.textContent = text.get('now');
                }
            }

            if (isOnLeft(previousMessage)) {
                div.style.marginLeft = '50px';
            } else {
                div.style.textAlign = 'right';
                div.style.marginRight = '50px';
            }

            chunkHolder.appendChild(div);
        }

        fragment.appendChild(chunkHolder);
    });

    return fragment;
};
