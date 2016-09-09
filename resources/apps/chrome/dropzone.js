var dropZoneReady = false
var setUpDropZone = function(containerId, dropZoneId, ondrop) {
    if (dropZoneReady) {
        return
    }

    var chatBar = document.getElementById(containerId)
    var dropZone = document.getElementById(dropZoneId)

    chatBar.addEventListener('dragenter', function(e) {
        e.stopPropagation()
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'

        dropZone.style.display = 'block'
    })

    dropZone.addEventListener('dragover', function(e) {
        e.stopPropagation()
        e.preventDefault()
    })

    dropZone.addEventListener('dragleave', function(e) {
        if (e.toElement.id == dropZoneId) {
            e.stopPropagation()
            e.preventDefault()

            dropZone.style.display = 'none'
        }
    })

    dropZone.addEventListener('drop', function(e) {
        e.stopPropagation()
        e.preventDefault()

        dropZone.style.display = 'none'

        var files = e.dataTransfer.files
        for (var i = 0; i < files.length; i++) {
            var file = files[i]
            ondrop(file)
        }
    })

    document.addEventListener('paste', function(e) {
        var items = (e.clipboardData || e.originalEvent.clipboardData).items
        for (var i = 0; i < items.length; i++) {
            var item = items[i]
            if (item.kind == 'file') {
                var file = item.getAsFile()
                e.stopPropagation()
                e.preventDefault()
                ondrop(file)
            }
        }
    })

    dropZoneReady = true
}
