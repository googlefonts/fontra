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
        if (isExternalChange) {
          this.setupUI();
          this.undoStack.clear();
        }
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
  grid-template-columns: auto auto;
  gap: 0.5em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-header {
  font-weight: bold;
  padding-top: 0.5em;
  padding-bottom: 0.5em;
}
.fontra-ui-font-info-cross-axis-mapping-panel-column-location-label {
  text-align: right;
}

.fontra-ui-font-info-cross-axis-mapping-panel-column-checkboxes {
  margin-left: -10px;
}

.fontra-ui-font-info-cross-axis-mapping-panel-column-empty.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-column-location.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-column-checkboxes.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-header.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-column-location-label.min-height {
  overflow: hidden;
  height: 0px;
  padding-top: 0px;
  padding-bottom: 0px;
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

.fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box.item-closed {
  grid-row-gap: 0em;
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
      inputLocationCheckboxes[axis.name] = mapping.inputLocation.hasOwnProperty(
        axis.name
      );
      outputLocationCheckboxes[axis.name] = mapping.outputLocation.hasOwnProperty(
        axis.name
      );
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

    const parentElement = thisIconElement.parentElement;
    if (isClosed) {
      parentElement.classList.remove("item-closed");
    } else {
      parentElement.classList.add("item-closed");
    }

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
        this.controllers.inputLocationCheckboxes.setItem(event.key, true);
      }, `edit input location ${event.key}`);
    });

    this.controllers.inputLocationCheckboxes.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        const defaultValue = this.fontAxesSourceSpace.find(
          (axis) => axis.name === event.key
        ).defaultValue;
        if (!event.newValue) {
          delete mapping.inputLocation[event.key];
          document.getElementById(`${this.mappingIndex}-${event.key}-input`).value =
            defaultValue;
        } else {
          mapping.inputLocation[event.key] = defaultValue;
        }
      }, `edit input location ${event.key}`);
    });

    this.controllers.outputLocation.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        mapping.outputLocation[event.key] = event.newValue;
        this.controllers.outputLocationCheckboxes.setItem(event.key, true);
      }, `edit output location ${event.key}`);
    });

    this.controllers.outputLocationCheckboxes.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        const defaultValue = this.fontAxesSourceSpace.find(
          (axis) => axis.name === event.key
        ).defaultValue;
        if (!event.newValue) {
          delete mapping.outputLocation[event.key];
          document.getElementById(`${this.mappingIndex}-${event.key}-output`).value =
            defaultValue;
        } else {
          mapping.outputLocation[event.key] = defaultValue;
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

    // Row 2 Locations headlines
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-column-empty" })
    );
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-column-empty" })
    );
    this.append(inputHeaderElement);
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-column-empty" })
    );
    this.append(outputHeaderElement);
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-column-empty" })
    );
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-column-empty" })
    );

    // Axis for input and output
    for (const axis of this.fontAxesSourceSpace) {
      this.append(
        html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-column-empty" })
      );
      this.append(buildElementLocationsLabel(axis));
      const input = buildElementLocations(axis, this.controllers.inputLocation);
      input.id = `${this.mappingIndex}-${axis.name}-input`;
      this.append(input);
      this.append(
        buildElementLocationsCheckboxes(axis, this.controllers.inputLocationCheckboxes)
      );
      const output = buildElementLocations(axis, this.controllers.outputLocation);
      output.id = `${this.mappingIndex}-${axis.name}-output`;
      this.append(output);
      this.append(
        buildElementLocationsCheckboxes(axis, this.controllers.outputLocationCheckboxes)
      );
      this.append(
        html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-column-empty" })
      );
    }
  }
}

customElements.define("cross-axis-mapping-box", CrossAxisMappingBox);

function _createSlider(controller, axis, modelValue, continuous = false) {
  const parms = {
    defaultValue: axis.defaultValue,
    value: modelValue !== undefined ? modelValue : axis.defaultValue,
    onChangeCallback: (event) => {
      if (continuous || !event.isDragging) {
        controller.setItem(axis.name, event.value);
      }
    },
  };
  if (axis.values) {
    // Discrete axis
    parms.values = axis.values;
  } else {
    // Continuous axis
    parms.minValue = axis.minValue;
    parms.maxValue = axis.maxValue;
  }
  return html.createDomElement("range-slider", parms);
}

function buildElementLocations(axis, controller) {
  const modelValue = controller.model[axis.name];
  const slider = _createSlider(controller, axis, modelValue);
  slider.setAttribute(
    "class",
    "fontra-ui-font-info-cross-axis-mapping-panel-column-location"
  );
  return slider;
}

function buildElementLocationsLabel(axis) {
  return html.label(
    { class: "fontra-ui-font-info-cross-axis-mapping-panel-column-location-label" },
    [axis.name]
  );
}

function buildElementLocationsCheckboxes(axis, controller) {
  const element = checkboxWithoutLabel(controller, axis.name);
  element.setAttribute(
    "class",
    "fontra-ui-font-info-cross-axis-mapping-panel-column-checkboxes"
  );
  element.setAttribute(
    "data-tooltip",
    translate("cross-axis-mapping.axis-participates")
  );
  element.setAttribute("data-tooltip-position", "right");
  return element;
}
