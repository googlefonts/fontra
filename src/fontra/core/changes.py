from dataclasses import is_dataclass
from functools import partial
from typing import get_args
from .classes import from_dict


def setItem(subject, key, item, *, itemCast=None):
    if itemCast is not None:
        item = itemCast(item)
    if isinstance(subject, (dict, list)):
        subject[key] = item
    else:
        setattr(subject, key, item)


def delItems(subject, index, deleteCount=1):
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
            if is_dataclass(subject):
                itemCast = getItemCast(subject, pathElement)
            subject = getattr(subject, pathElement)

    if functionName is not None:
        changeFunc = changeFunctions[functionName]
        args = change.get("a", [])
        if (
            itemCast is not None
            and changeFunc.__kwdefaults__ is not None
            and "itemCast" in changeFunc.__kwdefaults__
        ):
            changeFunc(subject, *args, itemCast=itemCast)
        else:
            changeFunc(subject, *args)

    for subChange in children:
        applyChange(subject, subChange, changeFunctions, itemCast=itemCast)


def getItemCast(subject, attrName):
    # Poking into the bowels of a dataclass. dataclasses.fields returns a tuple :(
    childType = subject.__class__.__dataclass_fields__[attrName].type
    if not is_dataclass(childType):
        # Extract the type for a typed list
        assert childType.__name__ == "list"
        args = get_args(childType)
        if len(args) == 1 and is_dataclass(args[0]):
            return partial(from_dict, args[0])
    return None
