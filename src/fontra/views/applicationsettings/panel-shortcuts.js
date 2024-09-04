import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { labeledCheckbox, labeledTextInput } from "../core/ui-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import {
  getActionIdentifiers,
  getActionInfo,
  getActionTitle,
  getShortCut,
  getShortCutRepresentation,
  getShortCuts,
  setCustomShortCuts,
  shortCutKeyMap,
} from "/core/actions.js";
import { translate } from "/core/localization.js";
import { dialog, dialogSetup, message } from "/web-components/modal-dialog.js";

const isMac = window.navigator.userAgent.indexOf("Mac") != -1;

const swappedKeyMap = Object.fromEntries(
  Object.entries(shortCutKeyMap).map((a) => a.reverse())
);

function getShortCutsGrouped() {
  const shortCutsGrouped = {};
  for (const actionIdentifier of getActionIdentifiers()) {
    const actionInfo = getActionInfo(actionIdentifier);
    const topic = actionInfo.topic || "shortcuts.other";
    if (!shortCutsGrouped[topic]) {
      shortCutsGrouped[topic] = [];
    }
    shortCutsGrouped[topic].push(actionIdentifier);
  }
  return shortCutsGrouped;
}

addStyleSheet(`
.fontra-ui-shortcuts-panel {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
}
.fontra-ui-shortcuts-panel-header {
  font-weight: bold;
}
.fontra-ui-shortcuts-panel-buttons {
  display: grid;
  grid-template-columns: max-content max-content max-content;
  gap: 1em;
}
`);

export class ShortCutsPanel extends BaseInfoPanel {
  static title = "shortcuts.title";
  static id = "shortcuts-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";

    this.panelElement.style = "gap: 1em;";

    const containerButtons = html.div(
      { class: "fontra-ui-shortcuts-panel-buttons" },
      []
    );
    containerButtons.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "Reset all shortcuts",
        onclick: (event) => this.resetToDefault(),
      })
    );

    containerButtons.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "Export shortcuts",
        onclick: (event) => this.exportShortCuts(),
      })
    );

    containerButtons.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "Import shortcuts",
        onclick: (event) => this.importShortCuts(),
      })
    );

    this.panelElement.appendChild(containerButtons);
    for (const [topicKey, actionIdentifiers] of Object.entries(getShortCutsGrouped())) {
      const container = html.div({ class: "fontra-ui-shortcuts-panel" }, []);
      container.appendChild(
        html.createDomElement("div", {
          class: "fontra-ui-shortcuts-panel-header",
          innerHTML: translate(topicKey),
        })
      );
      for (const actionIdentifier of actionIdentifiers) {
        container.appendChild(new ShortCutElement(actionIdentifier));
      }
      this.panelElement.appendChild(container);
    }
  }

  async resetToDefault() {
    const result = await dialog(
      "Reset to default",
      "Are you sure you want to reset all shortcuts to their default settings?",
      [
        { title: translate("dialog.cancel"), isCancelButton: true },
        { title: "Okay", isDefaultButton: true },
      ]
    );
    if (!result) {
      return;
    }
    for (const actionIdentifier of getActionIdentifiers()) {
      setCustomShortCuts(actionIdentifier, null);
    }
    location.reload();
  }

  async exportShortCuts() {
    // Only export custom shortcuts,
    // because default shortcuts are already in the code.
    const shortCutsDataCustom = {};
    for (const actionIdentifier of getActionIdentifiers()) {
      const actionInfo = getActionInfo(actionIdentifier);
      const shortCuts = actionInfo.customShortCuts;
      if (!shortCuts) {
        continue;
      }
      shortCutsDataCustom[actionIdentifier] = shortCuts;
    }
    const data = JSON.stringify(shortCutsDataCustom);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shortcuts.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async importShortCuts() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const data = JSON.parse(event.target.result);
        for (const actionIdentifier in data) {
          setCustomShortCuts(actionIdentifier, data[actionIdentifier]);
        }
        location.reload();
      };
      reader.readAsText(file);
    };
    input.click();
  }
}

function parseShortCutString(value) {
  if (value === "") {
    // Shortcut has been removed, therefore return null,
    // which is valid for json and different to undefined.
    // 'null' is a valid shortcut with no keys or codes.
    return null;
  }
  const definition = {};

  function setShortCutDefinitionByKey(key, value, definition) {
    const modifierKey =
      isMac && key === "metaKey"
        ? "commandKey"
        : !isMac && key === "ctrlKey"
        ? "commandKey"
        : key;
    if (value.includes(shortCutKeyMap[key])) {
      definition[modifierKey] = true;
      const keyStr = shortCutKeyMap[key];
      const index = value.indexOf(keyStr);
      value = value.slice(0, index) + value.slice(index + keyStr.length);
    }
    return value;
  }
  value = setShortCutDefinitionByKey("metaKey", value, definition);
  value = setShortCutDefinitionByKey("shiftKey", value, definition);
  value = setShortCutDefinitionByKey("ctrlKey", value, definition);
  value = setShortCutDefinitionByKey("altKey", value, definition);

  const codePoint = value.codePointAt(0);
  const isAtoZor0to9 =
    (codePoint >= 65 && codePoint <= 90) || (codePoint >= 48 && codePoint <= 57);
  definition.keyOrCode = isAtoZor0to9
    ? value.toLowerCase()
    : swappedKeyMap[value]
    ? [swappedKeyMap[value]]
    : value;

  return definition;
}

function isDifferentShortCutDefinition(a, b) {
  // Why isDifferent and not isEqual?
  // Because it is a faster return if something is different.
  const defA = _shortCutDefinitionNormalized(a);
  const defB = _shortCutDefinitionNormalized(b);

  if (defA === null || defB === null) {
    return defA != defB;
  }

  if (Object.keys(defA).length !== Object.keys(defB).length) {
    return true;
  }

  for (const key in defA) {
    if (defA[key] !== defB[key]) {
      return true;
    }
  }
  return false;
}

const shortCutDefinitionKeys = [
  "commandKey",
  "ctrlKey",
  "altKey",
  "shiftKey",
  "metaKey",
  "keyOrCode",
];
function _shortCutDefinitionNormalized(shortCutDefinition) {
  // For example: it removes false values, like altKey: false,
  // which is possible to be set via the double click dialog.
  if (shortCutDefinition === null) {
    return null;
  }
  if (shortCutDefinition === undefined) {
    return undefined;
  }
  if (!shortCutDefinition["keyOrCode"]) {
    // No keys or codes, is not valid,
    // therefore return null.
    // INFO: This is how you can delete a shortcut.
    return null;
  }
  const definition = {};
  for (const key of shortCutDefinitionKeys) {
    if (shortCutDefinition[key]) {
      if (key === "keyOrCode") {
        if (shortCutDefinition[key] === "") {
          return null;
        }
      }
      definition[key] = shortCutDefinition[key];
    }
  }
  return definition;
}

function validateShortCutDefinition(key, definition) {
  if (definition === null) {
    return [];
  }
  const warnings = [];
  for (const otherKey of getActionIdentifiers()) {
    if (key === otherKey) {
      // skip self
      continue;
    }
    for (const otherDefinition of getShortCuts(otherKey)) {
      if (!isDifferentShortCutDefinition(otherDefinition, definition)) {
        warnings.push("⚠️ ShortCut exists for: " + getActionTitle(otherKey));
        break;
      }
    }
  }

  if (definition.keyOrCode.length > 1 && !shortCutKeyMap[definition.keyOrCode]) {
    warnings.push(`⚠️ Invalid key or code: ${definition.keyOrCode}`);
  }

  return warnings;
}

async function doEditShortCutDialog(key) {
  const shortCutDefinition = getShortCut(key);
  const title = "Edit ShortCut: " + getActionTitle(key);

  const validateInput = () => {
    const warnings = validateShortCutDefinition(
      key,
      _shortCutDefinitionNormalized(controller.model)
    );

    warningElement.innerText = warnings.length ? warnings.join("\n") : "";
    dialog.defaultButton.classList.toggle("disabled", warnings.length);
  };

  const controllers = {
    ctrlKey: shortCutDefinition ? shortCutDefinition.ctrlKey : false,
    altKey: shortCutDefinition ? shortCutDefinition.altKey : false,
    shiftKey: shortCutDefinition ? shortCutDefinition.shiftKey : false,
    metaKey: shortCutDefinition ? shortCutDefinition.metaKey : false,
    keyOrCode: shortCutDefinition ? shortCutDefinition.keyOrCode : "",
  };
  if (isMac) {
    controllers.commandKey = shortCutDefinition.commandKey
      ? shortCutDefinition.commandKey
      : shortCutDefinition.metaKey || false;
    delete controllers.metaKey;
  } else {
    controllers.commandKey = shortCutDefinition.commandKey
      ? shortCutDefinition.commandKey
      : shortCutDefinition.ctrlKey || false;
    delete controllers.ctrlKey;
  }

  const controller = new ObservableController(controllers);

  controller.addKeyListener("commandKey", (event) => {
    validateInput();
  });
  controller.addKeyListener("altKey", (event) => {
    validateInput();
  });
  controller.addKeyListener("shiftKey", (event) => {
    validateInput();
  });
  controller.addKeyListener("keyOrCode", (event) => {
    validateInput();
  });

  if (isMac) {
    controller.addKeyListener("ctrlKey", (event) => {
      validateInput();
    });
  } else {
    controller.addKeyListener("metaKey", (event) => {
      validateInput();
    });
  }

  const disable = controller.model.keyOrCode != "" ? false : true;
  const { contentElement, warningElement } =
    _shortCutPropertiesContentElement(controller);
  const dialog = await dialogSetup(title, null, [
    { title: "Cancel", isCancelButton: true },
    { title: "Edit", isDefaultButton: true, disabled: disable },
  ]);

  dialog.setContent(contentElement);

  setTimeout(() => {
    const inputNameElement = contentElement.querySelector("#shortCut-text-input");
    inputNameElement.focus();
    inputNameElement.select();
  }, 0);

  validateInput();

  if (!(await dialog.run())) {
    // User cancelled
    return undefined;
  }

  return _shortCutDefinitionNormalized(controller.model);
}

function _shortCutPropertiesContentElement(controller) {
  const warningElement = html.div({
    id: "warning-text-anchor-name",
    style: `grid-column: 1 / -1; min-height: 1.5em;`,
  });

  const labeledCheckBoxSpecificOS = isMac
    ? labeledCheckbox(`Ctrl(${shortCutKeyMap["ctrlKey"]})`, controller, "ctrlKey", {})
    : labeledCheckbox(`Ctrl(${shortCutKeyMap["metaKey"]})`, controller, "metaKey", {});
  const contentElement = html.div(
    {
      style: `overflow: hidden;
        white-space: nowrap;
        display: grid;
        gap: 0.5em;
        grid-template-columns: auto auto;
        align-items: center;
        height: 100%;
        min-height: 0;
      `,
    },
    [
      ...labeledTextInput("Key or Code:", controller, "keyOrCode", {
        id: "shortCut-text-input",
      }),
      html.div(),
      labeledCheckbox(
        `Command (${shortCutKeyMap["commandKey"]})`,
        controller,
        "commandKey",
        {}
      ),
      html.div(),
      labeledCheckBoxSpecificOS,
      html.div(),
      labeledCheckbox(
        `Shift (${shortCutKeyMap["shiftKey"]})`,
        controller,
        "shiftKey",
        {}
      ),
      html.div(),
      labeledCheckbox(`Alt (${shortCutKeyMap["altKey"]})`, controller, "altKey", {}),
      html.div(),
      warningElement,
    ]
  );
  return { contentElement, warningElement };
}

const shortcutsPanelInputWidth = isMac ? "6em" : "12em"; // longer on windows because no icons are shown.
addStyleSheet(`
  .fontra-ui-shortcuts-panel-element {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 0.35rem 0 0 0;
    display: grid;
    grid-template-rows: auto auto;
    grid-template-columns: max-content max-content max-content max-content;
    grid-row-gap: 0.1em;
    grid-column-gap: 1em;
    height: 1.4em;
  }

  .fontra-ui-shortcuts-panel-input {
    width: ${shortcutsPanelInputWidth};
    text-align: center;
    caret-color: transparent;
  }

  .fontra-ui-shortcuts-panel-input:focus {
    border: 1px solid var(--background-color-dark);
    outline: unset;
    color: #999;
  }

  .fontra-ui-shortcuts-panel-label {
    width: 14em;
    overflow: hidden;
    text-align: right;
  }

  .fontra-ui-shortcuts-panel-icon {
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    background-color: green; /* for debugging */
  }

  .fontra-ui-shortcuts-panel-input:focus ~ * {
    pointer-events: unset;
    opacity: unset;
  }

  .fontra-ui-shortcuts-panel-icon:active {
    pointer-events: unset;
    opacity: unset;
  }

`);

class ShortCutElement extends HTMLElement {
  constructor(actionIdentifier) {
    super();
    this.classList.add("fontra-ui-shortcuts-panel-element");
    this.key = actionIdentifier;
    this.shortCutDefinition = getShortCut(this.key);
    this.label = getActionTitle(this.key);
    this.shorcutCommands = new Set();
    this._updateContents();
  }

  async doEditShortCut(id) {
    const shortCutDefinition = await doEditShortCutDialog(this.key);
    const newShortCutDefinition = _shortCutDefinitionNormalized(shortCutDefinition);
    if (newShortCutDefinition === undefined) {
      // User cancelled, do nothing.
      return;
    }
    if (this.saveShortCuts([newShortCutDefinition])) {
      const element = document.getElementById(id);
      element.value = getShortCutRepresentation(newShortCutDefinition);
      element.blur(); // remove focus
    }
  }

  saveShortCuts(newShortCutDefinitions) {
    if (!newShortCutDefinitions) {
      return false;
    }
    const warnings = [];
    for (const newShortCutDefinition of newShortCutDefinitions) {
      const warns = validateShortCutDefinition(this.key, newShortCutDefinition);
      for (const warn of warns) {
        warnings.push(warn);
      }
    }
    if (warnings.length > 0) {
      message(
        `Invalid ShortCut "${getShortCutRepresentation(
          newShortCutDefinitions[0]
        )}" for "${this.label}":`,
        warnings.join("\n")
      );
      return false;
    }
    setCustomShortCuts(this.key, newShortCutDefinitions);
    return true;
  }

  getPressedKey(event) {
    const mainkey = `${
      event.key.toLowerCase() === "control" ? "ctrl" : event.key.toLowerCase()
    }Key`;

    // collect the keys pressed in this.shorcutCommands
    if (event[mainkey]) {
      return mainkey;
    } else if (shortCutKeyMap.hasOwnProperty(event.code)) {
      return event.code;
    } else {
      return event.key;
    }
  }

  getShortCutCommand() {
    let shorcutCommand = "";
    Array.from(this.shorcutCommands).forEach((item) => {
      if (shortCutKeyMap.hasOwnProperty(item)) {
        shorcutCommand += shortCutKeyMap[item];
      } else {
        shorcutCommand += item;
      }
    });
    return shorcutCommand;
  }

  recordShortCut(id, event) {
    event.preventDefault();

    const pressedKey = this.getPressedKey(event);
    this.shorcutCommands.add(pressedKey);
    const shorcutCommand = this.getShortCutCommand();

    // show the current shortcut immediately, no delay:
    const element = document.getElementById(id);
    element.value = shorcutCommand;

    // if not alt, shift, ctrl or meta, end of recording -> save shortcut
    if (!event[pressedKey]) {
      const shortCutDefinition = parseShortCutString(shorcutCommand);
      if (!this.saveShortCuts([shortCutDefinition])) {
        // if the shortcut is invalid, reset the input field
        element.value = getShortCutRepresentation(this.shortCutDefinition);
      }
      element.blur(); // remove focus
      this.shorcutCommands = new Set();
    }
  }

  recordShortCutKeyup(id, event) {
    const mainkey = `${
      event.key.toLowerCase() === "control" ? "ctrl" : event.key.toLowerCase()
    }Key`;
    this.shorcutCommands.delete(mainkey); // remove the main key if it was pressed

    const element = document.getElementById(id);
    element.value =
      this.getShortCutCommand() != ""
        ? this.getShortCutCommand()
        : getShortCutRepresentation(this.shortCutDefinition);
  }

  resetShortCut(id) {
    const defaultShortCuts = getActionInfo(this.key).defaultShortCuts;

    if (this.saveShortCuts(defaultShortCuts)) {
      document.getElementById(id).value = getShortCutRepresentation(
        defaultShortCuts[0]
      );
    }
  }

  deleteShortCut(id) {
    if (this.saveShortCuts([null])) {
      document.getElementById(id).value = "";
    }
  }

  _updateContents() {
    this.innerHTML = "";
    const labelString = getActionTitle(this.key);
    this.append(
      html.label(
        {
          class: "fontra-ui-shortcuts-panel-label",
        },
        [labelString]
      )
    );

    const id = `shortcut-input-${this.key}`;
    this.append(
      html.input({
        type: "text",
        id: id,
        class: "fontra-ui-shortcuts-panel-input",
        value: getShortCutRepresentation(this.shortCutDefinition),
        // tooltip does not work with text input element -> use title instead.
        title:
          "Click and record a shortcut OR double click and open dialog for editing",
        onkeydown: (event) => this.recordShortCut(id, event),
        onkeyup: (event) => this.recordShortCutKeyup(id, event),
        ondblclick: (event) => this.doEditShortCut(id),
      })
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-shortcuts-panel-icon",
        "src": "/tabler-icons/refresh.svg", // TODO: I don't know why the icon is not shown.
        "value": "",
        "onclick": (event) => this.resetShortCut(id),
        "data-tooltip": "Reset to default",
        "data-tooltipposition": "top",
      })
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-shortcuts-panel-icon",
        "src": "/tabler-icons/trash.svg", // TODO: I don't know why the icon is not shown.
        "onclick": (event) => this.deleteShortCut(id),
        "data-tooltip": "Delete",
        "data-tooltipposition": "top",
      })
    );
  }
}

customElements.define("shortcut-element", ShortCutElement);