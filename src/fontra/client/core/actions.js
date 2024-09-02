import { translate } from "./localization.js";
import { ObservableController } from "./observable-object.js";
import {
  assert,
  capitalizeFirstLetter,
  commandKeyProperty,
  isActiveElementTypeable,
} from "./utils.js";

// const {
//   topic,
//   titleKey,
//   enabled,
//   callback,
//   customShortCuts,
//   defaultShortCuts,
//   allowGlobalOverride,  // This flag allows shortcuts to work even in a focused text box
// } = action;
//
// const { keyOrCode, commandKey, ctrlKey, metaKey, shiftKey, altKey } = shortCut;

let actionsByKeyOrCode = undefined;

const actionInfoController = new ObservableController({});
const actionCallbacks = {};
actionInfoController.synchronizeWithLocalStorage("fontra-actions-");
actionInfoController.addListener((event) => {
  actionsByKeyOrCode = undefined;
});

export function registerAction(actionIdentifier, actionInfo, callback, enabled = null) {
  registerActionInfo(actionIdentifier, actionInfo);
  registerActionCallbacks(actionIdentifier, callback, enabled);
}

export function registerActionInfo(actionIdentifier, actionInfo) {
  actionInfoController.synchronizeItemWithLocalStorage(actionIdentifier, actionInfo);
  // We only want customShortCuts to be changable, so we'll reset everything
  // except customShortCuts
  const storedActionInfo = getActionInfo(actionIdentifier);
  actionInfoController.model[actionIdentifier] = {
    ...actionInfo,
    customShortCuts: storedActionInfo.customShortCuts,
  };
}

export function registerActionCallbacks(actionIdentifier, callback, enabled = null) {
  actionCallbacks[actionIdentifier] = { callback, enabled };
}

export function setCustomShortCuts(actionIdentifier, customShortCuts) {
  const actionInfo = actionInfoController.model[actionIdentifier];
  assert(actionInfo, `unknown actionIdentifier: ${actionIdentifier}`);
  actionInfoController.model[actionIdentifier] = { ...actionInfo, customShortCuts };
}

export function getActionInfo(actionIdentifier) {
  return actionInfoController.model[actionIdentifier];
}

export function getActionTitle(actionIdentifier) {
  const actionInfo = getActionInfo(actionIdentifier);
  return translate(actionInfo?.titleKey || actionIdentifier);
}

export const shortCutKeyMap = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  Delete: "⌫",
};

export function getActionShortCutRepresentation(actionIdentifier) {
  if (!actionIdentifier) {
    return "";
  }

  const actionInfo = getActionInfo(actionIdentifier);

  if (!actionInfo) {
    return "";
  }

  const shortCuts = actionInfo.customShortCuts || actionInfo.defaultShortCuts || [];
  const shortCutDefinition = shortCuts[0];

  if (!shortCutDefinition) {
    return "";
  }

  let shortCutRepr = "";

  const isMac = navigator.platform.toLowerCase().indexOf("mac") >= 0;

  if (shortCutDefinition.shiftKey) {
    shortCutRepr += isMac ? "\u21e7" : "Shift+"; // ⇧ or Shift
  }
  if (shortCutDefinition.commandKey) {
    shortCutRepr += isMac ? "\u2318" : "Ctrl+"; // ⌘ or Ctrl
  } else if (shortCutDefinition.ctrlKey) {
    //
  }

  shortCutRepr +=
    shortCutKeyMap[shortCutDefinition.keyOrCode] ||
    capitalizeFirstLetter(shortCutDefinition.keyOrCode);

  return shortCutRepr;
}

export function canPerformAction(actionIdentifier) {
  const callbacks = actionCallbacks[actionIdentifier];
  return !!callbacks?.callback && (!callbacks.enabled || callbacks.enabled());
}

export function doPerformAction(actionIdentifier, event) {
  if (!canPerformAction(actionIdentifier)) {
    return false;
  }
  const { enabled, callback } = actionCallbacks[actionIdentifier];
  callback(event);
  return true;
}

export function getActionIdentifierFromKeyEvent(event) {
  if (event.repeat) {
    return null;
  }

  loadActionsByKeyOrCode();

  let actionShortCuts = actionsByKeyOrCode[event.key.toLowerCase()];

  if (!actionShortCuts) {
    actionShortCuts = actionsByKeyOrCode[event.code];
  }

  console.log(event);

  if (!actionShortCuts) {
    return null;
  }

  for (const { actionIdentifier, shortCut } of actionShortCuts) {
    const actionInfo = actionInfoController.model[actionIdentifier];
    assert(actionInfo, `Undefined action: ${actionIdentifier}`);

    if (
      !actionInfo.allowGlobalOverride &&
      (isActiveElementTypeable() || window.getSelection().toString())
    ) {
      continue;
    }

    if (!matchEventModifiers(shortCut, event) || !actionCallbacks[actionIdentifier]) {
      continue;
    }

    return actionIdentifier;
  }

  return null;
}

function loadActionsByKeyOrCode() {
  if (actionsByKeyOrCode) {
    return;
  }
  actionsByKeyOrCode = {};
  for (const [actionIdentifier, action] of Object.entries(actionInfoController.model)) {
    for (const shortCut of action.customShortCuts || action.defaultShortCuts) {
      if (!actionsByKeyOrCode[shortCut.keyOrCode]) {
        actionsByKeyOrCode[shortCut.keyOrCode] = [];
      }
      actionsByKeyOrCode[shortCut.keyOrCode].push({ actionIdentifier, shortCut });
    }
  }
}

const modifierProperties = ["metaKey", "ctrlKey", "shiftKey", "altKey"];

function matchEventModifiers(shortCut, event) {
  const expectedModifiers = { ...shortCut };
  if (shortCut.commandKey) {
    expectedModifiers[commandKeyProperty] = true;
  }

  return modifierProperties.every(
    (modifierProp) => !!expectedModifiers[modifierProp] === !!event[modifierProp]
  );
}
