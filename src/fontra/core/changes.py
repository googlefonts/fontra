def setItem(subject, key, item):
    if isinstance(subject, (dict, list)):
        subject[key] = item
    else:
        setattr(subject, key, item)


def delItems(subject, index, deleteCount=1):
    spliceItems(subject, index, deleteCount)


def insertItems(subject, index, *items):
    spliceItems(subject, index, 0, *items)


def spliceItems(subject, index, deleteCount, *items):
    subject[index : index + deleteCount] = items


baseChangeFunctions = {
    "=": setItem,
    "-": delItems,
    "+": insertItems,
    ":": spliceItems,
}


#
# A "change" object is a simple JS object containing several
# keys.
#
# "p": an array of path items, eg. ["glyphs", "Aring"]
# Optional: can be omitted if empty.
#
# "f": function name, to be looked up in the changeFunctions dict
# Optional: can be omitted if the change has children
#
# "a": "arguments", an array of arguments for the change function
# Optional: if omitted, defaults to an empty array
#
# "c": Array of child changes. Optional.
#


def applyChange(subject, change, changeFunctions):
    path = change.get("p", [])
    functionName = change.get("f")
    children = change.get("c", [])

    for pathElement in path:
        if isinstance(subject, (dict, list, tuple)):
            subject = subject[pathElement]
        else:
            subject = getattr(subject, pathElement)

    if functionName is not None:
        changeFunc = changeFunctions[functionName]
        args = change.get("a", [])
        changeFunc(subject, *args)

    for subChange in children:
        applyChange(subject, subChange, changeFunctions)
