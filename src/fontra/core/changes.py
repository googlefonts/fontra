from .classes import classSchema, classCastFuncs


def setItem(subject, key, item, *, itemCast=None):
    if itemCast is not None:
        item = itemCast(item)
    if isinstance(subject, (dict, list)):
        subject[key] = item
    else:
        setattr(subject, key, item)


def delAttr(subject, key, *, itemCast=None):
    if isinstance(subject, list):
        raise TypeError("can't call delattr on list")
    elif isinstance(subject, dict):
        del subject[key]
    else:
        delattr(subject, key)


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
    "d": delAttr,
    "-": delItems,
    "+": insertItems,
    ":": spliceItems,
}


# TODO: Refactor. These don't really belong here, and should ideally be registered from outside
changeFunctions = {
    **baseChangeFunctions,
    "=xy": lambda path, pointIndex, x, y: path.setPointPosition(pointIndex, x, y),
    "insertContour": lambda path, contourIndex, contour: path.insertContour(
        contourIndex, contour
    ),
    "deleteContour": lambda path, contourIndex: path.deleteContour(contourIndex),
    "deletePoint": lambda path, contourIndex, contourPointIndex: path.deletePoint(
        contourIndex, contourPointIndex
    ),
    "insertPoint": lambda path, contourIndex, contourPointIndex, point: path.insertPoint(
        contourIndex, contourPointIndex, point
    ),
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


def applyChange(subject, change, itemCast=None):
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
        applyChange(subject, subChange, itemCast=itemCast)


def getItemCast(subject, attrName, fieldKey):
    classFields = classSchema.get(type(subject))
    if classFields is not None:
        fieldDef = classFields[attrName]
        subtype = fieldDef.get(fieldKey)
        if subtype is not None:
            return classCastFuncs.get(subtype)
    return None


_MISSING = object()


def matchChangePattern(change, matchPattern):
    node = matchPattern
    for pathElement in change.get("p", []):
        childNode = node.get(pathElement, _MISSING)
        if childNode is _MISSING:
            return False
        if childNode is None:
            # leaf node
            return True
        node = childNode

    for childChange in change.get("c", []):
        if matchChangePattern(childChange, node):
            return True

    return False


def filterChangePattern(change, matchPattern):
    node = matchPattern
    matchedPath = []
    for pathElement in change.get("p", []):
        childNode = node.get(pathElement, _MISSING)
        if childNode is _MISSING:
            return None
        matchedPath.append(pathElement)
        if childNode is None:
            # leaf node
            return change
        node = childNode

    filteredChildren = []
    for childChange in change.get("c", []):
        childChange = filterChangePattern(childChange, node)
        if childChange is not None:
            filteredChildren.append(childChange)

    if not filteredChildren:
        return None

    if len(filteredChildren) == 1:
        if matchedPath:
            # consolidate
            result = {**filteredChildren[0]}
            path = matchedPath + result.get("p", [])
            if path:
                result["p"] = path
        else:
            result = filteredChildren[0]
    elif matchedPath:
        result = {"p": matchedPath, "c": filteredChildren}
    else:
        result = {"c": filteredChildren}

    return result


def addPathToPattern(matchPattern, path):
    node = matchPattern
    lastIndex = len(path) - 1
    for i, pathElement in enumerate(path):
        childNode = node.get(pathElement, _MISSING)
        if childNode is None:
            # leaf node, path is already included
            return
        if childNode is _MISSING:
            if i == lastIndex:
                newNode = None  # leaf
            else:
                newNode = {}
            childNode = node[pathElement] = newNode
        node = childNode


def removePathFromPattern(matchPattern, path):
    assert path
    firstPathElement = path[0]
    childNode = matchPattern.get(firstPathElement, _MISSING)
    if childNode is _MISSING:
        # path wasn't part of the pattern
        return
    if len(path) == 1:
        if childNode is None:
            del matchPattern[firstPathElement]
        else:
            # a deeper path is still part of the pattern, ignore
            pass
    else:
        if childNode is None:
            # path wasn't part of the pattern
            return
        removePathFromPattern(childNode, path[1:])
        if not childNode:
            del matchPattern[firstPathElement]
