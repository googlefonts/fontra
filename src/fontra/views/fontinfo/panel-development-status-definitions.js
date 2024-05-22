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
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "New status definition...",
        onclick: (event) => this.newStatusDef(),
      })
    );
    for (const statusDef of statusDefinitions) {
      this.infoForm = new Form();
      this.infoForm.className = "fontra-ui-font-info-axes-panel";
      this.infoForm.labelWidth = "max-content";

      this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
        const [rootKey, itemKey] = JSON.parse(fieldItem.key);
        const undoLabel = `change ${itemKey ? itemKey : rootKey}`;

        const root = {
          fontInfo: await this.fontController.getFontInfo(),
          unitsPerEm: this.fontController.unitsPerEm,
        };
        const changes = recordChanges(root, (root) => {
          if (itemKey) {
            const subject = root[rootKey];
            subject[itemKey] = value;
          } else {
            root[rootKey] = value;
          }
        });
        if (changes.hasChange) {
          await this.postChange(changes.change, changes.rollbackChange, undoLabel);
        }
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
          key: "StatusLabel",
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
              console.log("event.target.value", event.target.value);
              console.log("statusDef.color", statusDef.color);
              console.log("rgbaToHex(statusDef.color)", rgbaToHex(statusDef.color));
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
              console.log("StatusIsDefault", event.target.checked);
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

  // commented out for now
  //   async newStatusDefinition() {
  //     const statusDefinitions =
  //       this.fontController.customData["fontra.sourceStatusFieldDefinitions"];
  //     const validateInput = () => {
  //       const warnings = [];
  //       const editedStatusDefName =
  //         controller.model.statusDefName || controller.model.suggestedstatusDefName;
  //       for (const n of ["Value"]) {
  //         const value = controller.model[`statusDef${n}`];
  //         if (isNaN(value)) {
  //           if (value !== undefined) {
  //             warnings.push(`⚠️ The ${n.toLowerCase()} value must be a number`);
  //           }
  //         }
  //       }
  //       if (
  //         statusDefinitions &&
  //         statusDefinitions.some((statusDef) => statusDef.name === editedStatusDefName)
  //       ) {
  //         warnings.push("⚠️ The statusDef name should be unique");
  //       }
  //       warningElement.innerText = warnings.length ? warnings.join("\n") : "";
  //       dialog.defaultButton.classList.toggle("disabled", warnings.length);
  //     };

  //     const controller = new ObservableController({
  //       statusDefName: "In Progress",
  //       statusDefColor: 0,
  //       statusDefValue: 0,
  //       statusDefIsDefault: false,
  //       placeholderKeyColor: "suggestedStatusDefColor",
  //     });

  //     controller.addKeyListener("statusDefName", (event) => {
  //       validateInput();
  //     });
  //     controller.addKeyListener("statusDefColor", (event) => {
  //       validateInput();
  //     });
  //     controller.addKeyListener("statusDefValue", (event) => {
  //       validateInput();
  //     });
  //     controller.addKeyListener("statusDefIsDefault", (event) => {
  //       validateInput();
  //     });

  //     const disable =
  //       controller.model.statusDefName ||
  //       controller.model.statusDefColor ||
  //       controller.model.statusDefValue
  //         ? false
  //         : true;
  //     const { contentElement, warningElement } =
  //       this._statusDefPropertiesContentElement(controller);

  //     const dialog = await dialogSetup("New status definition", null, [
  //       { title: "Cancel", isCancelButton: true },
  //       { title: "Add new status definition", isDefaultButton: true, disabled: disable },
  //     ]);

  //     dialog.setContent(contentElement);

  //     setTimeout(
  //       () => contentElement.querySelector("#statusDef-name-text-input")?.focus(),
  //       0
  //     );

  //     validateInput();

  //     if (!(await dialog.run())) {
  //       // User cancelled
  //       return {};
  //     }

  //     const newStatus = {
  //       label: controller.model.statusDefName,
  //       color: hexToRgbaList(controller.model.statusDefColor),
  //       value: controller.model.statusDefValue,
  //       isDefault: controller.model.statusDefIsDefault,
  //     };
  //     console.log("newStatus", newStatus);

  //     const undoLabel = `add status definition '${newStatus.name}'`;
  //     console.log("undoLabel: ", undoLabel);
  //     const root = {
  //       customData: this.fontController.customData["fontra.sourceStatusFieldDefinitions"],
  //     };
  //     const changes = recordChanges(root, (root) => {
  //       root.customData["fontra.sourceStatusFieldDefinitions"].push(newStatus);
  //     });
  //     if (changes.hasChange) {
  //       this.postChange(changes.change, changes.rollbackChange, undoLabel);
  //       this.setupUI();
  //     }
  //   }

  //   _statusDefPropertiesContentElement(controller) {
  //     const warningElement = html.div({
  //       id: "warning-text-status-def",
  //       style: `grid-column: 1 / -1; min-height: 1.5em;`,
  //     });
  //     const contentElement = html.div(
  //       {
  //         style: `overflow: hidden;
  //           white-space: nowrap;
  //           display: grid;
  //           gap: 0.5em;
  //           grid-template-columns: auto auto;
  //           align-items: center;
  //           height: 100%;
  //           min-height: 0;
  //         `,
  //       },
  //       [
  //         ...labeledTextInput("Name:", controller, "statusDefName", {
  //           id: "statusDef-name-text-input",
  //         }),
  //         ...labeledTextInput("Color:", controller, "statusDefColor", {
  //           type: "color",
  //           placeholderKeyColor: "suggestedStatusDefColor",
  //         }),
  //         ...labeledTextInput("Value:", controller, "statusDefValue", {}),
  //         //html.div(),
  //         //labeledCheckbox("default", controller, "statusDefIsDefault", {}),
  //         html.br(),
  //         warningElement,
  //       ]
  //     );
  //     return { contentElement, warningElement };
  //   }

  async newStatusDef(statusDef = undefined) {
    // TODO: check for duplicates
    const statusFieldDefinitions =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"];
    if (!statusFieldDefinitions) {
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"] = [];
    }
    const nextStatusValue = !statusFieldDefinitions
      ? 0
      : statusFieldDefinitions
          .map((statusDef) => statusDef.value)
          .sort()
          .pop() + 1;
    console.log("nextStatusValue", nextStatusValue);
    // fix duplicates and isDefault
    if (
      statusDef &&
      statusFieldDefinitions.some((statusDef) => statusDef.value === statusDef.value)
    ) {
      console.info(
        "Status definition with value already exists, changed value to next available value."
      );
      statusDef = {
        ...statusDef,
        value: nextStatusValue,
      };
    }

    // fix isDefault
    if (statusDef && statusFieldDefinitions.some((statusDef) => statusDef.isDefault)) {
      console.info(
        "Status definition with isDefault already exists, changed value to false."
      );
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
      console.info("No status definition provided or found. Use default.");
      statusDef = {
        color: [1, 0, 0, 1],
        label: "Status definition name",
        value: nextStatusValue,
      };
    }
    //fontController.customData["fontra.sourceStatusFieldDefinitions"].push(statusDef);

    const undoLabel = `add status definition ${statusDef.value} '${statusDef.label}'`;
    console.log("undoLabel: ", undoLabel);
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"].push(statusDef);
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
    console.log("undoLabel: ", undoLabel);
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
