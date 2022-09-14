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
# "k": a key or index into the "subject"
#
# "v": "value", a single argument for the change function
# "a": "arguments", an array of arguments for the change function
# If the change has a change function ("f" key), it MUST also have
# a "v" key/value or an "a" key/value, but NOT both
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
        if (arg := change.get("v")) is not None:
            changeFunc(subject, change["k"], arg)
        elif (args := change.get("a")) is not None:
            changeFunc(subject, change["k"], *args)
        else:
            changeFunc(subject, change["k"])

    for subChange in children:
        applyChange(subject, subChange, changeFunctions)
