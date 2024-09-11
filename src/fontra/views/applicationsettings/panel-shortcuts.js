import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import {
  getActionIdentifiers,
  getActionInfo,
  getActionTitle,
  getBaseKeyFromKeyEvent,
  getShortCut,
  getShortCutRepresentation,
  getShortCuts,
  setCustomShortCuts,
  shortCutModifierMap,
} from "/core/actions.js";
import { translate } from "/core/localization.js";
import { commandKeyProperty, isMac } from "/core/utils.js";
import { IconButton } from "/web-components/icon-button.js"; // required for the icon buttons
import { dialog, message } from "/web-components/modal-dialog.js";

function getShortCutsGrouped() {
  const shortCutsGrouped = {};
  for (const actionIdentifier of getActionIdentifiers()) {
    const actionInfo = getActionInfo(actionIdentifier);
    const topic = actionInfo.topic || "9999-shortcuts.other";
    if (!shortCutsGrouped[topic]) {
      shortCutsGrouped[topic] = [];
    }
    shortCutsGrouped[topic].push(actionIdentifier);
  }

  // sort the actions by sortIndex
  for (const topic in shortCutsGrouped) {
    shortCutsGrouped[topic].sort((a, b) => {
      const actionInfoA = getActionInfo(a);
      const actionInfoB = getActionInfo(b);
      return actionInfoA.sortIndex - actionInfoB.sortIndex;
    });
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
    const shortCutsGrouped = getShortCutsGrouped();
    for (const topic of Object.keys(shortCutsGrouped).sort()) {
      const container = html.div({ class: "fontra-ui-shortcuts-panel" }, []);
      container.appendChild(
        html.createDomElement("div", {
          class: "fontra-ui-shortcuts-panel-header",
          innerHTML: translate(topic.slice(5)),
        })
      );
      for (const actionIdentifier of shortCutsGrouped[topic]) {
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
    const data = JSON.stringify(shortCutsDataCustom, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fontra-shortcuts.json";
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

function isShortCutDefinitionEqual(shortCutA, shortCutB) {
  if (shortCutA.baseKey !== shortCutB.baseKey) {
    return false;
  }

  const modifierProperties = ["commandKey", "ctrlKey", "altKey", "shiftKey", "metaKey"];

  for (const prop of modifierProperties) {
    if (!!shortCutA[prop] !== !!shortCutB[prop]) {
      return false;
    }
  }

  return true;
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
      if (isShortCutDefinitionEqual(otherDefinition, definition)) {
        warnings.push(`⚠️ ShortCut exists for "${getActionTitle(otherKey)}"`);
        break;
      }
    }
  }

  return warnings;
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
    this.shortCutLabel = getActionTitle(this.key);
    this.pressedKeys = new Set();
    this._updateContents();
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
        `Duplicate ShortCut "${getShortCutRepresentation(
          newShortCutDefinitions[0]
        )}" for "${this.shortCutLabel}":`,
        warnings.join("\n")
      );
      return false;
    }
    setCustomShortCuts(this.key, newShortCutDefinitions);
    this.shortCutDefinition = getShortCut(this.key);
    return true;
  }

  getPressedKey(event) {
    const baseKey = getBaseKeyFromKeyEvent(event);
    if (baseKey.startsWith("Meta")) {
      return "metaKey";
    } else if (baseKey.startsWith("Shift")) {
      return "shiftKey";
    } else if (baseKey.startsWith("Alt")) {
      return "altKey";
    } else if (baseKey.startsWith("Control")) {
      return "ctrlKey";
    }

    return baseKey;
  }

  getShortCutDefinition() {
    const shortCutDefinition = {};
    Array.from(this.pressedKeys).forEach((item) => {
      if (shortCutModifierMap.hasOwnProperty(item)) {
        if (commandKeyProperty === item) {
          shortCutDefinition.commandKey = true;
        } else {
          shortCutDefinition[item] = true;
        }
      } else {
        shortCutDefinition.baseKey = item;
      }
    });
    return shortCutDefinition;
  }

  recordShortCut(id, event) {
    event.preventDefault();

    const pressedKey = this.getPressedKey(event);
    this.pressedKeys.add(pressedKey);

    const shortCutDefinition = this.getShortCutDefinition();

    // show the current shortcut immediately, no delay:
    const element = document.getElementById(id);
    element.value = getShortCutRepresentation(shortCutDefinition);

    //if not alt, shift, ctrl or meta, end of recording -> save shortcut
    if (!event[pressedKey]) {
      if (!this.saveShortCuts([shortCutDefinition])) {
        // if the shortcut is invalid, reset the input field
        element.value = getShortCutRepresentation(this.shortCutDefinition);
      }
      element.blur(); // remove focus
      this.pressedKeys = new Set();
    }
  }

  recordShortCutKeyup(id, event) {
    // This removes the unpressed key
    this.pressedKeys.delete(this.getPressedKey(event));

    const element = document.getElementById(id);
    const shortCutRepresentation = getShortCutRepresentation(
      this.getShortCutDefinition()
    );
    element.value =
      shortCutRepresentation != ""
        ? shortCutRepresentation
        : getShortCutRepresentation(this.shortCutDefinition);
  }

  resetShortCut(id) {
    setCustomShortCuts(this.key, undefined);

    document.getElementById(id).value = getShortCutRepresentation(
      getShortCuts(this.key)[0]
    );
    this.shortCutDefinition = getShortCut(this.key);
  }

  deleteShortCut(id) {
    if (this.saveShortCuts([])) {
      document.getElementById(id).value = "";
    }
  }

  _updateContents() {
    this.innerHTML = "";
    this.append(
      html.label(
        {
          class: "fontra-ui-shortcuts-panel-label",
        },
        [this.shortCutLabel]
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
        title: "Click and record a shortcut",
        onkeydown: (event) => this.recordShortCut(id, event),
        onkeyup: (event) => this.recordShortCutKeyup(id, event),
      })
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-shortcuts-panel-icon",
        "src": "/tabler-icons/refresh.svg",
        "onclick": (event) => this.resetShortCut(id),
        "data-tooltip": "Reset to default",
        "data-tooltipposition": "top",
      })
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-shortcuts-panel-icon",
        "src": "/tabler-icons/x.svg",
        "onclick": (event) => this.deleteShortCut(id),
        "data-tooltip": "Clear",
        "data-tooltipposition": "top",
      })
    );
  }
}

customElements.define("shortcut-element", ShortCutElement);
