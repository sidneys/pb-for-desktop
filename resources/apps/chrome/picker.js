'use strict'

window.picker = {}
picker.onescape = {}

window.onkeydown = function(e) {
    if (e.keyCode == utils.ESC) {
        var bubble = true
        Object.keys(picker.onescape).forEach(function(key) {
            var onescape = picker.onescape[key]
            if (onescape()) {
                bubble = false
            }
        })

        return bubble
    }
}

picker.setUp = function(spec) {
    var localStorageKey = spec.inputId + 'LastTargetSelected'

    var inputElement = document.getElementById(spec.inputId)
    var pickerElement = document.getElementById(spec.pickerId)
    var overlayElement = document.getElementById(spec.overlayId)

    inputElement.onfocus = function(e) {
        overlayElement.style.display = 'none'
        inputElement.select()
        delete inputElement.target
        show()
    }

    var lastRow, lastTarget
    inputElement.onblur = function(e) {
        setTimeout(function() {
            hide()
        }, 300)
    }

    inputElement.onclick = function(e) {
        show()
    }

    overlayElement.onclick = function(e) {
        inputElement.focus()
    }

    var activeRow
    var updateActive = function() {
        if (activeRow && !activeRow.classList.contains('selected')) {
            activeRow.classList.add('selected')
            activeRow.scrollIntoView()
        }
    }

    inputElement.onkeydown = function(e) {
        if (pickerElement.style.display != 'block') {
            return
        }

        if (e.keyCode == utils.TAB) {
            if (activeRow) {
                activeRow.click()
            } else if (pickerElement.firstChild) {
                 pickerElement.firstChild.click()
            }
            return false
        } else if (e.keyCode == utils.ENTER) {
            if (activeRow) {
                activeRow.click()
            } else if (pickerElement.firstChild) {
                 pickerElement.firstChild.click()
            }
            return false
        } else if (e.keyCode == utils.UP_ARROW) {
            if (activeRow && activeRow.previousSibling) {
                activeRow.classList.remove('selected')
                activeRow = activeRow.previousSibling
                updateActive()
            }
        } else if (e.keyCode == utils.DOWN_ARROW) {
            if (!activeRow) {
                activeRow = pickerElement.firstChild
            } else {
                if (activeRow.nextSibling) {
                    activeRow.classList.remove('selected')
                    activeRow = activeRow.nextSibling
                }
            }

            updateActive()
        } else {
            show()
        }
    }

    inputElement.onkeyup = function(e) {
        if ([utils.ESC, utils.ENTER, utils.TAB, utils.UP_ARROW, utils.DOWN_ARROW].indexOf(e.keyCode) == -1) {
            show()
        }
    }

    var show = function() {
        if (!spec.targets) {
            overlayElement.style.display = 'none'
            hide()
            return
        }

        activeRow = null

        pickerElement.style.display = 'block'

        var fragment = document.createDocumentFragment()

        var filter = inputElement.value.toLowerCase()

        spec.targets.forEach(function(target) {
            var row = createRow(target)

            if (filter && row.filterText.indexOf(filter) == -1) {
                return
            }

            row.onclick = function() {
                selectRow(row, target, true)
            }

            fragment.appendChild(row)
        })

        while (pickerElement.firstChild) {
            pickerElement.removeChild(pickerElement.firstChild)
        }

        pickerElement.appendChild(fragment)

        if (pickerElement.children.length == 0) {
            pickerElement.style.display = 'none'
        }
    }

    var hide = function() {
        if (!inputElement.target && lastTarget && (inputElement.id != 'compose-recipient' || !inputElement.value.trim())) {
            selectRow(lastRow, lastTarget)
        }

        if (pickerElement.style.display == 'none') {
            return false
        }

        pickerElement.style.display = 'none'

        if (!inputElement.target) {
            delete localStorage[localStorageKey]
        }

        return true
    }

    var selectRow = function(row, target) {
        row.onclick = null
        row.classList.remove('selected')
        inputElement.value = ''
        inputElement.target = target
        lastTarget = target
        lastRow = row
        localStorage[localStorageKey] = (target.with && target.with.email_normalized) ? target.with.email_normalized
                                                                                    : (target.iden || target.phone)

        while (overlayElement.firstChild) {
            overlayElement.removeChild(overlayElement.firstChild)
        }

        overlayElement.style.display = 'block'
        overlayElement.appendChild(row)

        hide()

        if (spec.onselect) {
            spec.onselect(target)
        }
    }

    var selectedKey = spec.selectedKey || localStorage[localStorageKey]
    var selectedRow
    if (selectedKey) {
        spec.targets.forEach(function(target) {
            if (target.with ? target.with.email_normalized == selectedKey : (target.iden || target.phone) == selectedKey) {
                selectedRow = createRow(target)
                inputElement.target = target
            }
        })
    }

    if (!selectedRow && spec.targets.length > 0 && !spec.noDefault) {
        var target = spec.targets[0]
        selectedRow = createRow(target)
        inputElement.target = target
    }

    if (selectedRow) {
        selectRow(selectedRow, inputElement.target)
    } else {
        overlayElement.style.display = 'none'
    }

    picker.onescape[spec.pickerId] = hide
}

var rowCache = {}

var createRow = function(target) {
    var row = rowCache[target.iden || target.phone]
    if (!row) {
        var img = document.createElement('img')
        img.className = 'picker-target-image'
        img.src = utils.streamImageUrl(target)

        var nameDiv = document.createElement('div')
        nameDiv.className = 'picker-target-text'
        nameDiv.textContent = utils.streamDisplayName(target)

        var row = document.createElement('div')
        row.className = 'picker-option'
        row.appendChild(img)
        row.appendChild(nameDiv)

        row.filterText = nameDiv.textContent.toLowerCase()

        rowCache[target.iden || target.phone] = row
    }

    return row
}
