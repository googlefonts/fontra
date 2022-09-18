def setItem(subject, key, value):
    subject[key] = value


baseChangeFunctions = {
    "=": setItem,
}


#
# A "change" object is a simple JS object containing several
# keys.
#
# "p": an array of path items, eg. ["glyphs", "Aring"]
# Optional: can be omitted if empty.
#
# "f": function name, to be lookud up in the changeFunctions dict
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
        subject = subject[pathElement]

    if functionName is not None:
        changeFunc = changeFunctions[functionName]
        args = change.get("a", [])
        changeFunc(subject, *args)

    for subChange in children:
        applyChange(subject, subChange, changeFunctions)
