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


def applyChange(subject, change):
    """Apply `change` to `subject`."""
    _applyChange(subject, change)


def _applyChange(subject, change, *, itemCast=None):
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
        _applyChange(subject, subChange, itemCast=itemCast)


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
    """Return `True` or `False`, depending on whether the `change` matches
    the `matchPattern`.

    A `matchPattern` is tree in the form of a dict, where keys are change path
    elements, and values are either nested pattern dicts or `None`, to indicate
    a leaf node.
    """
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


def filterChangePattern(change, matchPattern, inverse=False):
    """Return a subset of the `change` according to the `matchPattern`, or `None`
    if the `change` doesn't match `matchPattern` at all. If there is a match,
    all parts of the change that do not match are not included in the returned
    change object.

    A `matchPattern` is tree in the form of a dict, where keys are change path
    elements, and values are either nested pattern dicts or `None`, to indicate
    a leaf node.

    If `inverse` is True, `matchPattern` is used to exclude the change items
    that match from the return value.
    """
    node = matchPattern
    for pathElement in change.get("p", []):
        childNode = node.get(pathElement, _MISSING)
        if childNode is _MISSING:
            return change if inverse else None
        if childNode is None:
            # leaf node
            return None if inverse else change
        node = childNode

    filteredChildren = []
    for childChange in change.get("c", []):
        childChange = filterChangePattern(childChange, node, inverse)
        if childChange is not None:
            filteredChildren.append(childChange)

    result = {**change, "c": filteredChildren}
    if not inverse:
        # We've at most matched one or more children, but not the root change
        result.pop("f", None)
        result.pop("a", None)

    return _normalizeChange(result)


def _normalizeChange(change):
    children = change.get("c", ())

    if "f" not in change and len(children) == 1:
        # Turn only child into root change
        result = {**children[0]}
        # Prefix child path with original root path
        result["p"] = change.get("p", []) + result.get("p", [])
    else:
        result = {**change}

    if not result.get("p"):
        # Remove empty path
        result.pop("p", None)

    if not result.get("c"):
        # Remove empty children list
        result.pop("c", None)

    if len(result) == 1 and "p" in result:
        # Nothing left but a path: no-op change
        result.pop("p", None)

    if not result:
        result = None

    return result


def addPathToPattern(matchPattern, path):
    """Add `path` to `matchPattern`, so `matchPattern` will match `path`.
    If the pattern already matches a prefix of `path`, this function does
    nothing.
    """
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
    """Remove `path` from `matchPattern`, so `matchPattern` no longer matches `path`.
    If the pattern matches a prefix of `path`, or if `path` was not included in
    `matchPattern` to begin with, this function does nothing.
    """
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


def collectChangePaths(change, depth):
    """Return a sorted list of paths of the specified `depth` that the `change`
    includes."""
    return sorted(set(_iterateChangePaths(change, depth)))


def _iterateChangePaths(change, depth, prefix=()):
    path = prefix + tuple(change.get("p", ()))
    if len(path) >= depth:
        yield path[:depth]
        return
    for childChange in change.get("c", []):
        yield from _iterateChangePaths(childChange, depth, path)
