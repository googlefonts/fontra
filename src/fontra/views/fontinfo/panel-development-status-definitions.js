import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { enumerate, hexToRgba, range, rgbaToHex } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";

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
    for (const index of range(statusDefinitions.length)) {
      statusDefsContainer.appendChild(
        new StatusDefinitionBox(
          this.fontController,
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
    const statusFieldDefinitions =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"];
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
      if (!statusFieldDefinitions) {
        root.customData["fontra.sourceStatusFieldDefinitions"] = [];
      }
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
.fontra-ui-font-info-status-definitions-panel-status-def-box {
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

.fontra-ui-font-info-status-definitions-panel-status-def-box-delete {
  justify-self: end;
  /*align-self: start;*/
}

.fontra-ui-font-info-status-definitions-panel-status-def-box-color-input {
  width: 8em;
  /*height: 1.6em; without height: best compromise for all browsers*/
  margin: 0;
  padding: 0;
  outline: none;
  border: none;
  border-color: transparent;
  border-radius: 0.25em;
}
`);

class StatusDefinitionBox extends HTMLElement {
  constructor(fontController, statusIndex, postChange, setupUI) {
    super();
    this.classList.add("fontra-ui-font-info-status-definitions-panel-status-def-box");
    this.fontController = fontController;
    this.statusIndex = statusIndex;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this._updateContents();
  }

  get statusDef() {
    return this.fontController.customData["fontra.sourceStatusFieldDefinitions"][
      this.statusIndex
    ];
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
    const undoLabel = `delete status def '${this.statusDef.name}'`;
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"].splice(statusIndex, 1);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  changeStatusDefIsDefault(statusDef, event) {
    const undoLabel = `change status definition isDefault`;
    if (!event.target.checked) {
      delete statusDef["isDefault"];
      this.replaceStatusDef(statusDef, undoLabel);
      return;
    }

    // If checked: Set all status definitions to false, first.
    for (const [index, oldStatusDef] of enumerate(
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"]
    )) {
      const newStatusDef = { ...oldStatusDef };
      delete newStatusDef["isDefault"];
      this.replaceStatusDef(newStatusDef, undoLabel, index);
    }
    // Then: set this status definition to true
    const updatedStatusDef = {
      ...statusDef,
      isDefault: true,
    };
    this.replaceStatusDef(updatedStatusDef, undoLabel);
  }

  _updateContents() {
    this.innerHTML = "";
    const statusDef = this.statusDef;
    this.append(
      html.input({
        "type": "color",
        "class":
          "fontra-ui-font-info-status-definitions-panel-status-def-box-color-input",
        "value": rgbaToHex(statusDef.color.slice(0, 3).concat([1])),
        "onchange": (event) => {
          const updatedStatusDef = {
            ...statusDef,
            color: hexToRgba(event.target.value),
          };
          this.replaceStatusDef(updatedStatusDef, "change status definition color");
        },
        "data-tooltip": "Specify the color for this status definition",
        "data-tooltipposition": "top",
      })
    );

    this.append(
      html.input({
        type: "text",
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

    const checkBoxIdentifier = `statusDefIsDefault${this.statusIndex}`;
    this.append(
      html.div(
        {
          "style": "margin: auto;",
          "data-tooltip":
            "If set: This color will be used if a source status is not set.",
          "data-tooltipposition": "top",
        },
        [
          html.input({
            type: "checkbox",
            checked: statusDef.isDefault,
            id: checkBoxIdentifier,
            onchange: (event) => this.changeStatusDefIsDefault(statusDef, event),
          }),
          html.label(
            {
              for: checkBoxIdentifier,
              style: "margin: auto;/*padding: 3px*/",
            },
            ["Is Default"]
          ),
        ]
      )
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-status-definitions-panel-status-def-box-delete",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteStatusDef(this.statusIndex),
        "data-tooltip": "Delete status definition",
        "data-tooltipposition": "left",
      })
    );
  }
}

customElements.define("status-def-box", StatusDefinitionBox);
