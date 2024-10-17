import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import {
  checkboxWithoutLabel,
  labeledTextInput,
  setupSortableList,
} from "../core/ui-utils.js";
import { enumerate, range, round } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import { mapAxesFromUserSpaceToSourceSpace } from "/core/var-model.js";
import "/web-components/add-remove-buttons.js";
import "/web-components/designspace-location.js";
import { dialogSetup, message } from "/web-components/modal-dialog.js";
// keep the dialog imports for now, because we may need them for check infos.

export class CrossAxisMappingPanel extends BaseInfoPanel {
  static title = "cross-axis-mapping.title";
  static id = "cross-axis-mapping-panel";
  static fontAttributes = ["axes"];

  initializePanel() {
    super.initializePanel();
    this.fontController.addChangeListener(
      { axes: null },
      (change, isExternalChange) => {
        this.setupUI();
        this.undoStack.clear();
      },
      false
    );
  }

  async setupUI() {
    const mappings = this.fontController.axes.mappings;

    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const index of range(mappings.length)) {
      container.appendChild(
        new CrossAxisMappingBox(
          this.fontController,
          this.fontAxesSourceSpace,
          mappings,
          index,
          this.postChange.bind(this),
          this.setupUI.bind(this)
        )
      );
    }

    setupSortableList(container);

    container.addEventListener("reordered", (event) => {
      const reordered = [];
      for (const [index, crossAxisMappingBox] of enumerate(container.children)) {
        reordered.push(crossAxisMappingBox.mapping);
        crossAxisMappingBox.mappingIndex = index;
      }
      const undoLabel = translate("cross-axis-mapping.undo.reorder");
      this.replaceMappings(reordered, undoLabel);
    });

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: translate("cross-axis-mapping.new"),
        onclick: (event) => this.newCrossAxisMapping(),
      })
    );
    this.panelElement.appendChild(container);
    this.panelElement.focus();
  }

  async newCrossAxisMapping() {
    //new empty mapping
    const newMapping = {
      description: "Unnamed",
      groupDescription: null,
      inputLocation: {},
      outputLocation: {},
    };

    const undoLabel = translate("cross-axis-mapping.undo.add");

    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      root.axes.mappings.push(newMapping);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  async replaceMappings(updatedMappings, undoLabel) {
    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      root.axes.mappings.splice(0, root.axes.mappings.length, ...updatedMappings);
    });
    await this.postChange(changes.change, changes.rollbackChange, undoLabel);
  }
}

addStyleSheet(`
.fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: max-content max-content max-content max-content max-content max-content auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-column {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
  overflow: scroll;
  margin-bottom: 0.5em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-column-location {
  display: grid;
  grid-template-columns: auto;
  gap: 0.5em;
}

.fontra-ui-font-info-cross-axis-panel-column-checkboxes {
  display: grid;
  grid-template-columns: auto;
  gap: 0.5em;
  margin-left: -10px;
}

.fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-column-location.min-height,
.fontra-ui-font-info-cross-axis-panel-column-checkboxes.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-header.min-height {
  overflow: hidden;
  height: 0px;
  padding-bottom: 0px;
}

.fontra-ui-font-info-cross-axis-mapping-panel-header {
  font-weight: bold;
  padding-bottom: 0.5em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon {
  justify-self: end;
  align-self: start;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon.open-close-icon {
  height: 1.5em;
  width: 1.5em;
  transition: 120ms;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon.open-close-icon.item-closed {
  transform: rotate(180deg);
}

`);

class CrossAxisMappingBox extends HTMLElement {
  constructor(
    fontController,
    fontAxesSourceSpace,
    mappings,
    mappingIndex,
    postChange,
    setupUI
  ) {
    super();
    this.classList.add(
      "fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box"
    );
    this.draggable = true;
    this.fontController = fontController;
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.mappings = mappings;
    this.mapping = mappings[mappingIndex];
    this.mappingIndex = mappingIndex;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this.controllers = {};
    this.models = this._getModels();
    this._updateContents();
  }

  _getModels() {
    const mapping = this.mapping;

    //add checkboxes for each axis
    const inputLocationCheckboxes = {};
    const outputLocationCheckboxes = {};
    for (const axis of this.fontAxesSourceSpace) {
      inputLocationCheckboxes[axis.name] = mapping.inputLocation[axis.name] || false;
      outputLocationCheckboxes[axis.name] = mapping.outputLocation[axis.name] || false;
    }

    const model = {
      description: { description: mapping.description || "" },
      groupDescription: { groupDescription: mapping.groupDescription || "" },
      inputLocation: { ...mapping.inputLocation },
      inputLocationCheckboxes: { ...inputLocationCheckboxes },
      outputLocation: { ...mapping.outputLocation },
      outputLocationCheckboxes: { ...outputLocationCheckboxes },
    };

    return model;
  }

  editCrossAxisMapping(editFunc, undoLabel) {
    console.log(
      "editCrossAxisMapping works, but after a change the cards get folded – which is not nice."
    );

    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      editFunc(root.axes.mappings[this.mappingIndex]);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  deleteCrossAxisMapping() {
    const undoLabel = translate(
      "cross-axis-mapping.undo.delete",
      this.mapping.description || this.mappingIndex
    );
    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      root.axes.mappings.splice(this.mappingIndex, 1);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  toggleShowHide(event) {
    const cardElements = !event.altKey
      ? [this]
      : document.querySelectorAll(
          ".fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box"
        );

    const thisIconElement = this.querySelector("#open-close-icon");
    const isClosed = thisIconElement.classList.contains("item-closed");

    for (const cardElement of cardElements) {
      const elementIcon = cardElement.querySelector("#open-close-icon");
      if (isClosed) {
        elementIcon.classList.remove("item-closed");
        for (const child of cardElement.children) {
          child.classList.remove("min-height");
        }
      } else {
        elementIcon.classList.add("item-closed");
        for (const child of cardElement.children) {
          child.classList.add("min-height");
        }
      }
    }
  }

  _updateContents() {
    const models = this.models;

    // create controllers
    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
    }

    // create listeners
    this.controllers.description.addListener((event) => {
      // TODO: Maybe add check of value, if unique?
      this.editCrossAxisMapping((mapping) => {
        mapping[event.key] = event.newValue.trim();
      }, `edit input description ${event.key}`);
    });

    this.controllers.groupDescription.addListener((event) => {
      // TODO: Maybe add check of value.
      this.editCrossAxisMapping((mapping) => {
        mapping[event.key] = event.newValue.trim();
      }, `edit input groupDescription ${event.key}`);
    });

    this.controllers.inputLocation.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        mapping.inputLocation[event.key] = event.newValue;
      }, `edit input location ${event.key}`);
    });

    this.controllers.inputLocationCheckboxes.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        if (!event.newValue) {
          delete mapping.inputLocation[event.key];
        } else {
          // Do nothing, because the value must be different from default. Otherwise it will not be used.
          // It will be checked anyway, if the user changes the slider.
        }
      }, `edit input location ${event.key}`);
    });

    this.controllers.outputLocation.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        mapping.outputLocation[event.key] = event.newValue;
      }, `edit output location ${event.key}`);
    });

    this.controllers.outputLocationCheckboxes.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        if (!event.newValue) {
          delete mapping.outputLocation[event.key];
        } else {
          // Do nothing, because the value must be different from default. Otherwise it will not be used.
          // It will be checked anyway, if the user changes the slider.
          return;
        }
      }, `edit output location ${event.key}`);
    });

    this.innerHTML = "";
    // row 1 mailnly for icon
    this.append(
      html.createDomElement("icon-button", {
        class: "fontra-ui-font-info-cross-axis-mapping-panel-icon open-close-icon",
        id: "open-close-icon",
        src: "/tabler-icons/chevron-up.svg",
        open: false,
        onclick: (event) => this.toggleShowHide(event),
      })
    );

    this.append(html.div()); // empty cell for grid
    this.append(
      html.div(
        { class: "fontra-ui-font-info-cross-axis-mapping-panel-column" },
        labeledTextInput(
          translate("cross-axis-mapping.description"),
          this.controllers.description,
          "description",
          { continuous: false }
        )
      )
    );
    this.append(html.div()); // empty cell for grid
    this.append(
      html.div(
        { class: "fontra-ui-font-info-cross-axis-mapping-panel-column" },
        labeledTextInput(
          translate("cross-axis-mapping.groupDescription"),
          this.controllers.groupDescription,
          "groupDescription",
          { continuous: false }
        )
      )
    );
    this.append(html.div()); // empty cell for grid

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-cross-axis-mapping-panel-icon",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteCrossAxisMapping(),
        "data-tooltip": translate("cross-axis-mapping.delete"),
        "data-tooltipposition": "left",
      })
    );

    const inputHeaderElement = html.div(
      { class: "fontra-ui-font-info-cross-axis-mapping-panel-header" },
      [translate("cross-axis-mapping.header.inputLocation")]
    );
    inputHeaderElement.setAttribute(
      "data-tooltip",
      translate("cross-axis-mapping.header.inputLocation.tooltip")
    );
    inputHeaderElement.setAttribute("data-tooltipposition", "left");

    const outputHeaderElement = html.div(
      { class: "fontra-ui-font-info-cross-axis-mapping-panel-header" },
      [translate("cross-axis-mapping.header.outputLocation")]
    );
    outputHeaderElement.setAttribute(
      "data-tooltip",
      translate("cross-axis-mapping.header.outputLocation.tooltip")
    );
    outputHeaderElement.setAttribute("data-tooltipposition", "left");

    // Row 2 locations headlines
    this.append(html.div()); // empty cell for grid
    this.append(html.div()); // empty cell for grid
    this.append(inputHeaderElement);
    this.append(html.div()); // empty cell for grid
    this.append(outputHeaderElement);
    this.append(html.div()); // empty cell for grid
    this.append(html.div()); // empty cell for grid

    // row 3 locations
    this.append(html.div()); // empty cell for grid
    this.append(buildElementLocationsLabel(this.fontAxesSourceSpace));
    this.append(
      buildElementLocations(this.controllers.inputLocation, this.fontAxesSourceSpace)
    );
    this.append(
      buildElementLocationsCheckboxes(this.controllers.inputLocationCheckboxes)
    );
    this.append(
      buildElementLocations(this.controllers.outputLocation, this.fontAxesSourceSpace)
    );
    this.append(
      buildElementLocationsCheckboxes(this.controllers.outputLocationCheckboxes)
    );
    this.append(html.div()); // empty cell for grid
  }
}

customElements.define("cross-axis-mapping-box", CrossAxisMappingBox);

function buildElementLocations(controller, fontAxes) {
  const locationElement = html.createDomElement("designspace-location", {
    continuous: false,
    labels: false,
    class: `fontra-ui-font-info-cross-axis-mapping-panel-column-location`,
  });
  locationElement.axes = fontAxes;
  locationElement.controller = controller;
  return locationElement;
}

function buildElementLocationsLabel(fontAxes) {
  let items = [];
  for (const axis of fontAxes) {
    items.push([axis.name]);
  }

  return html.div(
    {
      class: "fontra-ui-font-info-cross-axis-mapping-panel-column-location",
    },
    items
      .map(([labelName]) => {
        return html.label(
          {
            style: "text-align: right;",
          },
          [labelName]
        );
      })
      .flat()
  );
}

function buildElementLocationsCheckboxes(controller) {
  let items = [];
  for (const key in controller.model) {
    items.push([key]);
  }

  return html.div(
    { class: "fontra-ui-font-info-cross-axis-panel-column-checkboxes" },
    items
      .map(([keyName]) => {
        const element = checkboxWithoutLabel(controller, keyName);
        element.setAttribute(
          "data-tooltip",
          translate("cross-axis-mapping.axis-participates")
        );
        element.setAttribute("data-tooltip-position", "right");
        return element;
      })
      .flat()
  );
}
