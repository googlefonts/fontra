from .classes import classSchema, classCastFuncs


def setItem(subject, key, item, *, itemCast=None):
    if itemCast is not None:
        item = itemCast(item)
    if isinstance(subject, (dict, list)):
        subject[key] = item
    else:
        setattr(subject, key, item)


def delItems(subject, index, deleteCount=1, itemCast=None):
    spliceItems(subject, index, deleteCount)


def insertItems(subject, index, *items, itemCast=None):
    spliceItems(subject, index, 0, *items, itemCast=itemCast)


def spliceItems(subject, index, deleteCount, *items, itemCast=None):
    if itemCast is not None:
        items = [itemCast(item) for item in items]
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


def applyChange(subject, change, changeFunctions, itemCast=None):
    path = change.get("p", [])
    functionName = change.get("f")
    children = change.get("c", [])

    for pathElement in path:
        itemCast = None
        if isinstance(subject, (dict, list, tuple)):
            subject = subject[pathElement]
        else:
            itemCast = getItemCast(subject, pathElement, "subtype")
            subject = getattr(subject, pathElement)

    if functionName is not None:
        changeFunc = changeFunctions[functionName]
        args = change.get("a", [])
        if functionName in baseChangeFunctions:
            if itemCast is None and args:
                itemCast = getItemCast(subject, args[0], "type")
            changeFunc(subject, *args, itemCast=itemCast)
        else:
            changeFunc(subject, *args)

    for subChange in children:
        applyChange(subject, subChange, changeFunctions, itemCast=itemCast)


def getItemCast(subject, attrName, fieldKey):
    classFields = classSchema.get(type(subject))
    if classFields is not None:
        fieldDef = classFields[attrName]
        subtype = fieldDef.get(fieldKey)
        if subtype is not None:
            return classCastFuncs.get(subtype)
    return None
