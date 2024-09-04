import { translate } from "./localization.js";
import { ObservableController } from "./observable-object.js";
import {
  assert,
  capitalizeFirstLetter,
  commandKeyProperty,
  isActiveElementTypeable,
} from "./utils.js";

// Action Info
// const {
//   topic,
//   titleKey,
//   customShortCuts,
//   defaultShortCuts,
//   allowGlobalOverride,  // This flag allows shortcuts to work even in a focused text box
// } = action;
//
// const { keyOrCode, commandKey, ctrlKey, metaKey, shiftKey, altKey } = shortCut;

let actionsByHandleKey = undefined;

const actionInfoController = new ObservableController({});
const actionCallbacks = {};
actionInfoController.synchronizeWithLocalStorage("fontra-actions-", true);
actionInfoController.addListener((event) => {
  actionsByHandleKey = undefined;
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

export function getActionIdentifiers() {
  return Object.keys(actionInfoController.model);
}

export function getActionInfo(actionIdentifier) {
  return actionInfoController.model[actionIdentifier];
}

export function getActionTitle(actionIdentifier, args = "") {
  const actionInfo = getActionInfo(actionIdentifier);
  return translate(actionInfo?.titleKey || actionIdentifier, args);
}

const shortCutKeyMapDefault = {
  commandKey: "Ctrl+", // fontra specific cross-platform key
  metaKey: "Meta+",
  shiftKey: "Shift+",
  ctrlKey: "Ctrl+",
  altKey: "Alt+",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Tab: "⇥",
  Delete: "⌫",
  Backspace: "⌫",
  NumpadMultiply: "×",
  NumpadDivide: "÷",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  Enter: "↵",
  Space: "␣",
};

// add A-Z keys
for (const key of new Array(26).fill(1).map((_, i) => String.fromCharCode(65 + i))) {
  shortCutKeyMapDefault[`Key${key}`] = key;
}
// add 0-9 keys
for (let i = 0; i <= 9; i++) {
  shortCutKeyMapDefault[`Digit${i}`] = `${i}`;
  shortCutKeyMapDefault[`Numpad${i}`] = `${i}`;
}

const shortCutKeyMapMac = {
  commandKey: "⌘", // fontra specific cross-platform key
  metaKey: "⌘", // "\u2318"
  shiftKey: "⇧", // "\u21e7"
  ctrlKey: "⌃",
  altKey: "⌥", // "\u2325"
};

export const shortCutKeyMap = {
  ...shortCutKeyMapDefault,
  ...(window.navigator.userAgent.indexOf("Mac") != -1 ? shortCutKeyMapMac : {}),
};

export function getShortCuts(actionIdentifier) {
  const actionInfo = getActionInfo(actionIdentifier);
  return actionInfo?.customShortCuts || actionInfo?.defaultShortCuts || [];
}

export function getShortCut(actionIdentifier) {
  const shortCuts = getShortCuts(actionIdentifier);
  return shortCuts[0];
}

export function getShortCutRepresentationFromActionIdentifier(actionIdentifier) {
  if (!actionIdentifier) {
    return "";
  }
  return getShortCutRepresentation(getShortCut(actionIdentifier));
}

export function getShortCutRepresentation(shortCutDefinition) {
  if (!shortCutDefinition) {
    // Shortcut definition can be undefined,
    // if the action has no shortcut specified.
    return "";
  }
  let shortCutRepr = "";

  for (const key of ["commandKey", "metaKey", "ctrlKey", "altKey", "shiftKey"]) {
    if (shortCutDefinition[key]) {
      shortCutRepr += shortCutKeyMap[key];
    }
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

function getActionShortcutsByEvent(event) {
  // This is required because of situations like this:
  // { keyOrCode: "b", shiftKey: true, altKey:true, metaKey: true }
  // event.key = "‹"
  // event.code = "KeyB"
  // shortCutKeyMap[event.key] = undefined
  // shortCutKeyMap[event.code] = "B"
  // -> BUT: keyOrCode is actually "b"
  const possibleKeys = [
    event.key,
    event.code,
    shortCutKeyMap[event.key],
    shortCutKeyMap[event.code],
  ];
  for (const keyOrCode of possibleKeys) {
    if (!keyOrCode) {
      continue;
    }
    const actionShortcuts = actionsByHandleKey[getShortCutHandleKey(keyOrCode, event)];
    if (actionShortcuts) {
      return actionShortcuts;
    }
  }
}

export function getActionIdentifierFromKeyEvent(event) {
  if (event.repeat) {
    return null;
  }

  loadActionsByKeyOrCode();
  const actionShortCuts = getActionShortcutsByEvent(event);

  if (!actionShortCuts) {
    return null;
  }

  for (const { actionIdentifier, shortCut } of actionShortCuts) {
    const actionInfo = actionInfoController.model[actionIdentifier];
    assert(actionInfo, `Undefined action: ${actionIdentifier}`);

    if (
      isActiveElementTypeable() &&
      !shortCut.commandKey &&
      !shortCut.metaKey &&
      !shortCut.ctrlKey
    ) {
      // We are in an editable text area: we will not match short cuts
      // that don't use the meta key or the control key.
      continue;
    }

    if (
      !actionInfo.allowGlobalOverride &&
      (isActiveElementTypeable() || window.getSelection().toString())
    ) {
      // We are either in an editable text area, or there is non-editable text
      // selected, and the action didn't set allowGlobalOverride. Ignore this
      // context.
      continue;
    }

    if (!matchEventModifiers(shortCut, event) || !actionCallbacks[actionIdentifier]) {
      continue;
    }

    return actionIdentifier;
  }

  return null;
}

function getShortCutHandleKey(keyOrCode, modifiers) {
  // A unique key for the action based on the key and modifiers is required,
  // because the same keyOrCode could be used multiple times with different modifiers, eg:
  // { keyOrCode: "p" } vs { keyOrCode: "p", commandKey: true }
  let handleKey = keyOrCode.toLowerCase();
  if (modifiers.commandKey) {
    handleKey += `+${commandKeyProperty}`;
  }
  if (modifiers.metaKey) {
    handleKey += "+metaKey";
  }
  if (modifiers.shiftKey) {
    handleKey += "+shiftKey";
  }
  if (modifiers.altKey) {
    handleKey += "+altKey";
  }
  if (modifiers.ctrlKey) {
    handleKey += "+ctrlKey";
  }
  return handleKey;
}

function loadActionsByKeyOrCode() {
  if (actionsByHandleKey) {
    return;
  }
  actionsByHandleKey = {};
  for (const [actionIdentifier, action] of Object.entries(actionInfoController.model)) {
    for (const shortCut of action.customShortCuts || action.defaultShortCuts || []) {
      if (!shortCut) {
        // Skip, because shortcut can be null,
        // if the action has no shortcut.
        continue;
      }
      const shortCutHandleKey = getShortCutHandleKey(shortCut.keyOrCode, shortCut);
      if (!actionsByHandleKey[shortCutHandleKey]) {
        actionsByHandleKey[shortCutHandleKey] = [];
      }
      actionsByHandleKey[shortCutHandleKey].push({ actionIdentifier, shortCut });
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
