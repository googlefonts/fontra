import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { labeledTextInput } from "../core/ui-utils.js";
import { enumerate, hexToRgbaList } from "../core/utils.js";
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
.fontra-ui-font-info-axes-panel {
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
    console.log("statusDefinitions", statusDefinitions);

    // TODO: page content status color definitions

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const statusDef of statusDefinitions) {
      console.log("statusDef", statusDef);
      // container.appendChild(
      //   new statusBox(axes, index, this.postChange.bind(this), this.deleteAxis.bind(this))
      // );
    }

    //setupSortableList(container);

    // container.addEventListener("reordered", (event) => {
    //   const reorderedAxes = [];
    //   for (const [index, axisBox] of enumerate(container.children)) {
    //     reorderedAxes.push(axisBox.axis);
    //     axisBox.axisIndex = index;
    //   }
    //   this.replaceAxes(reorderedAxes, "Reorder axes");
    // });

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "New status definition...",
        onclick: (event) => this.newStatusDefinition(statusDefinitions),
      })
    );

    //this.panelElement.innerHTML = "";
    //this.panelElement.appendChild(this.infoForm);
  }

  async newStatusDefinition() {
    const statusDefinitions =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"];
    const validateInput = () => {
      const warnings = [];
      const editedStatusDefName =
        controller.model.statusDefName || controller.model.suggestedstatusDefName;
      for (const n of ["Value"]) {
        const value = controller.model[`statusDef${n}`];
        if (isNaN(value)) {
          if (value !== undefined) {
            warnings.push(`⚠️ The ${n.toLowerCase()} value must be a number`);
          }
        }
      }
      if (
        statusDefinitions &&
        statusDefinitions.some((statusDef) => statusDef.name === editedStatusDefName)
      ) {
        warnings.push("⚠️ The statusDef name should be unique");
      }
      warningElement.innerText = warnings.length ? warnings.join("\n") : "";
      dialog.defaultButton.classList.toggle("disabled", warnings.length);
    };

    const controller = new ObservableController({
      statusDefName: "In Progress",
      statusDefColor: 0,
      statusDefValue: 0,
      statusDefIsDefault: false,
      placeholderKeyColor: "suggestedStatusDefColor",
    });

    controller.addKeyListener("statusDefName", (event) => {
      validateInput();
    });
    controller.addKeyListener("statusDefColor", (event) => {
      validateInput();
    });
    controller.addKeyListener("statusDefValue", (event) => {
      validateInput();
    });
    controller.addKeyListener("statusDefIsDefault", (event) => {
      validateInput();
    });

    const disable =
      controller.model.statusDefName ||
      controller.model.statusDefColor ||
      controller.model.statusDefValue
        ? false
        : true;
    const { contentElement, warningElement } =
      this._statusDefPropertiesContentElement(controller);

    const dialog = await dialogSetup("New status definition", null, [
      { title: "Cancel", isCancelButton: true },
      { title: "Add new status definition", isDefaultButton: true, disabled: disable },
    ]);

    dialog.setContent(contentElement);

    setTimeout(
      () => contentElement.querySelector("#statusDef-name-text-input")?.focus(),
      0
    );

    validateInput();

    if (!(await dialog.run())) {
      // User cancelled
      return {};
    }

    const newStatus = {
      label: controller.model.statusDefName,
      color: hexToRgbaList(controller.model.statusDefColor),
      value: controller.model.statusDefValue,
      isDefault: controller.model.statusDefIsDefault,
    };
    console.log("newStatus", newStatus);

    const undoLabel = `add status definition '${newStatus.name}'`;
    const root = {
      customData: this.fontController.customData["fontra.sourceStatusFieldDefinitions"],
    };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"].push(newStatus);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  _statusDefPropertiesContentElement(controller) {
    const warningElement = html.div({
      id: "warning-text-status-def",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });
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
        ...labeledTextInput("Name:", controller, "statusDefName", {
          id: "statusDef-name-text-input",
        }),
        ...labeledTextInput("Color:", controller, "statusDefColor", {
          type: "color",
          placeholderKeyColor: "suggestedStatusDefColor",
        }),
        ...labeledTextInput("Value:", controller, "statusDefValue", {}),
        //html.div(),
        //labeledCheckbox("default", controller, "statusDefIsDefault", {}),
        html.br(),
        warningElement,
      ]
    );
    return { contentElement, warningElement };
  }
}

function getStatusFieldDefinitions(fontController) {
  const statusFieldDefinitions =
    fontController.customData["fontra.sourceStatusFieldDefinitions"];
  if (statusFieldDefinitions) {
    return statusFieldDefinitions;
  }
  return defaultStatusFieldDefinitions["fontra.sourceStatusFieldDefinitions"];
}
