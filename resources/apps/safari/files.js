pb.fileQueue = [];

var xhrs = {};

pb.pushFile = function(push) {
    push.queued = true;

    pb.fileQueue.push(push);

    pb.dispatchEvent('locals_changed');

    uploadFile();
};

pb.cancelUpload = function(push) {
    var index = pb.fileQueue.indexOf(push);
    if (index != -1) {
        pb.fileQueue.splice(index, 1);
    }

    var xhr = xhrs[push];
    if (xhr) {
        xhr.abort();
        uploading = false;
        uploadFile();
    }

    pb.dispatchEvent('locals_changed');
};

var uploading = false;
var uploadFile = function() {
    if (uploading) {
        return;
    }

    var push = pb.fileQueue[0];
    if (!push) {
        return;
    }

    var failed = function(push) {
        uploading = false;
        delete push.progress;
        push.failed = true;
        pb.fileQueue.shift();
        pb.failedPushes.push(push);

        pb.dispatchEvent('locals_changed');

        uploadFile();
    };

    uploading = true;

    pb.post(pb.api + '/v3/start-upload', {
        'name': push.file.name,
        'size': push.file.size,
        'suggested_type': push.file.type
    }, function(response, error) {
        if (!response) {
            push.error = error;
            failed(push);
            return;
        }

        try {
            var tasks = [], progress = 0;

            var start = 0;
            response.piece_urls.forEach(function(url) {
                var end = start + response.piece_size;
                var piece = push.file.slice(start, end);

                var task = {
                    'url': url,
                    'piece': piece
                };

                tasks.push(task);

                start = end;
            });

            var finished = function() {
                delete xhrs[push];

                pb.post(pb.api + '/v3/finish-upload', {
                    'id': response.id
                }, function(response) {
                    if (response) {
                        uploading = false;
                        pb.fileQueue.shift();

                        delete push.file;

                        push.type = 'file';
                        push.file_name = response.file_name;
                        push.file_type = response.file_type;
                        push.file_url = response.file_url;
                        pb.sendPush(push);

                        uploadFile();
                    } else {
                        failed(push);
                    }
                });
            };

            var runTask = function(task) {
                pb.devtools('Uploading chunk to ' + task.url);

                var xhr = new XMLHttpRequest();
                xhr.open("POST", task.url, true);

                var lastUpdate = Date.now();
                xhr.upload.onprogress = function(e) {
                    var percent = e.loaded / e.total;
                    var percentInRemainingTasks = tasks.length / response.piece_urls.length;
                    push.progress = (1 - percentInRemainingTasks) * percent + ((response.piece_urls.length - (tasks.length + 1)) / response.piece_urls.length);

                    if (Date.now() - lastUpdate > 900) {
                        pb.dispatchEvent('locals_changed');
                        lastUpdate = Date.now();
                    }
                };

                xhr.onload = function () {
                    delete xhrs[push];

                    var next = tasks.shift();
                    if (next) {
                        runTask(next);
                    } else {
                        finished();
                    }
                };

                xhr.onerror = function() {
                    delete xhrs[push];
                    failed(push);
                };

                xhr.send(task.piece);

                xhrs[push] = xhr;
            };

            var task = tasks.shift();
            runTask(task);
        } catch (e) {
            failed(push);
            throw e;
        }
    });
};
