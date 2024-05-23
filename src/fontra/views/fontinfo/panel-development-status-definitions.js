import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { labeledTextInput } from "../core/ui-utils.js";
import { enumerate, hexToRgbaList, rgbaToCSS, rgbaToHex } from "../core/utils.js";
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
    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 0.5em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "New status definition",
        onclick: (event) => this.newStatusDef(),
      })
    );
    for (const statusDef of statusDefinitions) {
      this.infoForm = new Form();
      this.infoForm.className = "fontra-ui-font-info-axes-panel";
      this.infoForm.labelWidth = "max-content";

      this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
        const statusValue = fieldItem.key;
        const statusDef = this.fontController.customData[
          "fontra.sourceStatusFieldDefinitions"
        ].find((statusDef) => statusDef.value === statusValue);

        console.log("edit-text value", value);
        const updatedStatusDef = {
          ...statusDef,
          label: value,
        };
        this.replaceStatusDef(
          statusDef.value,
          updatedStatusDef,
          "change status definition label"
        );
      };

      const formContents = [];

      formContents.push({
        type: "header",
        label: `Status Definition ${statusDef.value}`,
        auxiliaryElement: html.createDomElement("icon-button", {
          "style": `width: 1.3em;`,
          "src": "/tabler-icons/trash.svg",
          "onclick": (event) => this.deleteStatusDef(statusDef.value),
          "data-tooltip": "Delete status definition",
          "data-tooltipposition": "left",
        }),
      });

      formContents.push({
        type: "universal-row",
        field1: {
          type: "edit-text",
          key: statusDef.value,
          value: statusDef.label,
          width: "6em",
        },
        field2: {
          type: "auxiliaryElement",
          key: "StatusLabel",
          auxiliaryElement: html.input({
            type: "color",
            style: `margin: 0; padding: 0; outline: none;`,
            value: rgbaToHex(statusDef.color),
            onchange: (event) => {
              const updatedStatusDef = {
                ...statusDef,
                color: hexToRgbaList(event.target.value),
              };
              this.replaceStatusDef(
                statusDef.value,
                updatedStatusDef,
                "change status definition color"
              );
            },
          }),
        },
        field3: {
          type: "auxiliaryElement",
          key: "StatusIsDefault",
          auxiliaryElement: html.input({
            "type": "checkbox",
            "id": "statusDefIsDefault",
            "style": `width: auto; margin: 0; padding: 0; outline: none;`,
            "checked": statusDef.isDefault,
            "onclick": (event) => {
              const undoLabel = `change status definition isDefault`;
              if (event.target.checked) {
                // if checked, set all other status definitions to false
                for (const statusDefTemp of this.fontController.customData[
                  "fontra.sourceStatusFieldDefinitions"
                ]) {
                  delete statusDefTemp["isDefault"];
                  this.replaceStatusDef(statusDefTemp.value, statusDefTemp, undoLabel);
                }
                // set this status definition to true
                const updatedStatusDef = {
                  ...statusDef,
                  isDefault: true,
                };
                this.replaceStatusDef(statusDef.value, updatedStatusDef, undoLabel);
              } else {
                delete statusDef["isDefault"];
                this.replaceStatusDef(statusDef.value, statusDef, undoLabel);
              }
            },
            "data-tooltip": "Is Default",
            "data-tooltipposition": "left",
          }),
        },
      });

      this.infoForm.setFieldDescriptions(formContents);
      this.panelElement.appendChild(this.infoForm);
    }
  }

  async newStatusDef(statusDef = undefined) {
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

  async replaceStatusDef(statusDefValue, updatedStatusDef, undoLabel) {
    const index = this.fontController.customData[
      "fontra.sourceStatusFieldDefinitions"
    ].findIndex((statusDef) => statusDef.value === statusDefValue);
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"].splice(
        index,
        1,
        updatedStatusDef
      );
    });

    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  async deleteStatusDef(statusDefValue) {
    const index = this.fontController.customData[
      "fontra.sourceStatusFieldDefinitions"
    ].findIndex((statusDef) => statusDef.value === statusDefValue);
    const undoLabel = `delete status definition ${statusDefValue}`;
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"].splice(index, 1);
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
