import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { labeledTextInput } from "../core/ui-utils.js";
import {
  enumerate,
  hexToRgbaList,
  range,
  rgbaToCSS,
  rgbaToHex,
} from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { dialogSetup } from "/web-components/modal-dialog.js";
import { Form } from "/web-components/ui-form.js";

const defaultStatusFieldDefinitions = {
  "fontra.sourceStatusFieldDefinitions": [
    {
      color: [1, 0, 0, 1],
      isDefault: true,
      label: "In progress",
      value: 0,
    },
    {
      color: [1, 0.5, 0, 1],
      label: "Checking-1",
      value: 1,
    },
    {
      color: [1, 1, 0, 1],
      label: "Checking-2",
      value: 2,
    },
    {
      color: [0, 0.5, 1, 1],
      label: "Checking-3",
      value: 3,
    },
    {
      color: [0, 1, 0.5, 1],
      label: "Validated",
      value: 4,
    },
  ],
};

addStyleSheet(`
.fontra-ui-font-info-statusDefs-panel {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
}
`);

export class DevelopmentStatusDefinitionsPanel extends BaseInfoPanel {
  static title = "Status definitions";
  static id = "development-status-definitions-panel";
  static fontAttributes = ["statusDefinitions"];

  async setupUI() {
    const statusDefinitions = getStatusFieldDefinitions(this.fontController);

    const statusDefsContainer = html.div({
      style: "display: grid; gap: 0.5em;",
    });
    console.log("statusDefinitions", statusDefinitions);
    for (const index of range(statusDefinitions.length)) {
      statusDefsContainer.appendChild(
        new StatusDefBox(
          this.fontController,
          statusDefinitions,
          index,
          this.postChange.bind(this),
          this.setupUI.bind(this)
        )
      );
    }

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "New status definition",
        onclick: (event) => this.newStatusDef(),
      })
    );
    this.panelElement.appendChild(statusDefsContainer);
    this.panelElement.focus();
  }

  async newStatusDef(statusDef = undefined) {
    console.log("newStatusDef", statusDef);
    const statusFieldDefinitions =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"];
    if (!statusFieldDefinitions) {
      // if not present, create default status definitions
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"] = [];
    }
    const nextStatusValue = !statusFieldDefinitions
      ? 0
      : statusFieldDefinitions
          .map((statusDef) => statusDef.value)
          .sort()
          .pop() + 1;

    // fix duplicates
    if (
      statusDef &&
      statusFieldDefinitions.some((statusDef) => statusDef.value === statusDef.value)
    ) {
      // Status definition with value already exists,
      // changed value to next available value.
      statusDef = {
        ...statusDef,
        value: nextStatusValue,
      };
    }

    // fix isDefault
    if (statusDef && statusFieldDefinitions.some((statusDef) => statusDef.isDefault)) {
      // Status definition with isDefault already exists,
      // changed value to false.
      delete statusDef["isDefault"];
    }

    if (!statusDef) {
      const defaultStatuses =
        defaultStatusFieldDefinitions["fontra.sourceStatusFieldDefinitions"];
      statusDef = defaultStatuses.find(
        (statusDef) => statusDef.value == nextStatusValue
      );
    }

    if (!statusDef) {
      // No status definition provided or found.
      // Use default.
      statusDef = {
        color: [1, 0, 0, 1],
        label: `Status definition ${nextStatusValue}`,
        value: nextStatusValue,
      };
    }

    const undoLabel = `add status definition ${statusDef.value} '${statusDef.label}'`;
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"].push(statusDef);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }
}

function getStatusFieldDefinitions(fontController) {
  const statusFieldDefinitions =
    fontController.customData["fontra.sourceStatusFieldDefinitions"];
  if (statusFieldDefinitions) {
    return statusFieldDefinitions;
  }
  return [];
}

addStyleSheet(`
:root {
  --fontra-ui-font-info-status-definitions-panel-max-list-height: 12em;
}

.fontra-ui-font-info-status-definitions-panel-axis-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: max-content max-content max-content auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-status-definitions-panel-axis-box-values,
.fontra-ui-font-info-status-definitions-panel-axis-box-names {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
}

.fontra-ui-font-info-status-definitions-panel-axis-box-mapping-list {
  width: 8em;
  max-height: var(--fontra-ui-font-info-status-definitions-panel-max-list-height);
}

.fontra-ui-font-info-status-definitions-panel-axis-box-label-list {
  max-width: max-content;
  max-height: var(--fontra-ui-font-info-status-definitions-panel-max-list-height);
}

.fontra-ui-font-info-status-definitions-panel-axis-box-delete {
  justify-self: end;
  align-self: start;
}

select {
  font-family: "fontra-ui-regular";
}

.fontra-ui-font-info-status-definitions-panel-axis-box-header {
  font-weight: bold;
}
`);

class StatusDefBox extends HTMLElement {
  constructor(fontController, statusDefs, statusIndex, postChange, setupUI) {
    super();
    this.classList.add("fontra-ui-font-info-status-definitions-panel-axis-box");
    this.draggable = true;
    this.fontController = fontController;
    this.statusDefs = statusDefs;
    this.statusIndex = statusIndex;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this._updateContents();
  }

  get statusDef() {
    return this.statusDefs[this.statusIndex];
  }

  editStatusDef(editFunc, undoLabel) {
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      editFunc(
        root.customData["fontra.sourceStatusFieldDefinitions"][this.statusIndex]
      );
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  replaceStatusDef(newStatusDef, undoLabel, statusIndex = this.statusIndex) {
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"][statusIndex] =
        newStatusDef;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  deleteStatusDef(statusIndex) {
    const statusDef =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"][
        statusIndex
      ];
    const undoLabel = `delete status def '${statusDef.name}'`;
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"].splice(statusIndex, 1);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  _updateContents() {
    this.innerHTML = "";
    const statusDef = this.statusDef;
    this.appendChild(
      html.input({
        type: "color",
        style: `width: 8em; height: 1.6em; margin: 0; padding: 0; outline: none; border: none; border-color: transparent`,
        value: rgbaToHex(statusDef.color),
        onchange: (event) => {
          const updatedStatusDef = {
            ...statusDef,
            color: hexToRgbaList(event.target.value),
          };
          this.replaceStatusDef(updatedStatusDef, "change status definition color");
        },
      })
    );

    this.appendChild(
      html.input({
        type: "text",
        style: `height: 1.6em; margin: 0; padding: 3px; outline: none;`,
        value: statusDef.label,
        onchange: (event) => {
          const updatedStatusDef = {
            ...statusDef,
            label: event.target.value,
          };
          this.replaceStatusDef(updatedStatusDef, "change status definition label");
        },
      })
    );

    this.appendChild(
      html.div({ style: "height: 1.6em;" }, [
        html.input({
          "type": "checkbox",
          "style": `margin: 0; padding: 0; outline: none;`,
          "checked": statusDef.isDefault,
          "id": "statusDefIsDefault",
          "data-tooltip": "Is Default",
          "data-tooltipposition": "left",
          "onchange": (event) => {
            const undoLabel = `change status definition isDefault`;
            if (event.target.checked) {
              // if checked, set all other status definitions to false
              for (const [index, statusDefTemp] of enumerate(
                this.fontController.customData["fontra.sourceStatusFieldDefinitions"]
              )) {
                delete statusDefTemp["isDefault"];
                this.replaceStatusDef(statusDefTemp, undoLabel, index);
              }
              // set this status definition to true
              const updatedStatusDef = {
                ...statusDef,
                isDefault: true,
              };
              this.replaceStatusDef(updatedStatusDef, undoLabel);
            } else {
              delete statusDef["isDefault"];
              this.replaceStatusDef(statusDef, undoLabel);
            }
          },
        }),
        html.label(
          {
            for: "statusDefIsDefault",
            style: "padding: 3px",
          },
          [`Is Default`]
        ),
      ])
    );

    this.appendChild(
      html.createDomElement("icon-button", {
        //type: "button",
        "style": `width: 1.3em; height: 1.6em; align: right;`,
        "src": "/tabler-icons/trash.svg",
        //value: "Delete",
        "onclick": (event) => this.deleteStatusDef(this.statusIndex),
        "data-tooltip": "Delete status definition",
        "data-tooltipposition": "left",
      })
    );
  }
}

customElements.define("status-def-box", StatusDefBox);
