import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import {
  OptionalNumberFormatter,
  labelForElement,
  labeledCheckbox,
  labeledTextInput,
  setupSortableList,
  textInput,
} from "../core/ui-utils.js";
import { round } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { CrossAxisMapping } from "/core/cross-axis-mapping.js";
import { translate } from "/core/localization.js";
import {
  locationToString,
  makeSparseLocation,
  mapAxesFromUserSpaceToSourceSpace,
} from "/core/var-model.js";
import "/web-components/add-remove-buttons.js";
import "/web-components/designspace-location.js";
import { dialogSetup, message } from "/web-components/modal-dialog.js";

export class CrossAxisMappingPanel extends BaseInfoPanel {
  static title = "cross-axis-mapping.title";
  static id = "cross-axis-mapping-panel";
  static fontAttributes = ["axes", "sources"];

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
    const sources = await this.fontController.getSources();
    const mappings = this.fontController.axes.mappings;
    console.log("mappings", mappings);

    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );

    //const axisNames = this.fontAxesSourceSpace.map((axis) => axis.name);

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const mapping of mappings) {
      console.log("cross-axis-mapping:", mapping);
      container.appendChild(
        new CrossAxisMappingBox(
          this.fontAxesSourceSpace,
          mapping,
          this.postChange.bind(this),
          this.setupUI.bind(this)
        )
      );
    }

    setupSortableList(container);

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
    console.log("newCrossAxisMapping");
    //const mam = new CrossAxisMapping(axes, mappings);

    // const newCrossAxisMapping = await this._sourcePropertiesRunDialog();
    // if (!newCrossAxisMapping) {
    //   return;
    // }

    // const undoLabel = translate(`add cross axis mapping %0`, newCrossAxisMapping.name);// key: cross-axis-mapping.add;

    // let sourceIdentifier;
    // do {
    //   sourceIdentifier = crypto.randomUUID().slice(0, 8);
    // } while (sourceIdentifier in this.fontController.sources);

    // const root = { sources: this.fontController.sources };
    // const changes = recordChanges(root, (root) => {
    //   root.sources[sourceIdentifier] = newCrossAxisMapping;
    // });
    // if (changes.hasChange) {
    //   this.postChange(changes.change, changes.rollbackChange, undoLabel);
    //   this.setupUI();
    // }
  }

  // async _sourcePropertiesRunDialog() {
  //   const sources = await this.fontController.getSources();
  //   const locationAxes = this.fontAxesSourceSpace;
  //   const validateInput = () => {
  //     const warnings = [];
  //     const editedSourceName = nameController.model.sourceName;
  //     if (!editedSourceName.length || !editedSourceName.trim()) {
  //       warnings.push("⚠️ The source name must not be empty");
  //     }
  //     if (
  //       Object.keys(sources)
  //         .map((sourceIdentifier) => {
  //           if (sources[sourceIdentifier].name === editedSourceName.trim()) {
  //             return true;
  //           }
  //         })
  //         .includes(true)
  //     ) {
  //       warnings.push("⚠️ The source name should be unique");
  //     }
  //     const locStr = locationToString(
  //       makeSparseLocation(locationController.model, locationAxes)
  //     );
  //     if (sourceLocations.has(locStr)) {
  //       warnings.push("⚠️ The source location must be unique");
  //     }
  //     warningElement.innerText = warnings.length ? warnings.join("\n") : "";
  //     dialog.defaultButton.classList.toggle("disabled", warnings.length);
  //   };

  //   const nameController = new ObservableController({
  //     sourceName: this.getSourceName(sources),
  //   });

  //   nameController.addKeyListener("sourceName", (event) => {
  //     validateInput();
  //   });

  //   const sourceLocations = new Set(
  //     Object.keys(sources).map((sourceIdentifier) => {
  //       return locationToString(
  //         makeSparseLocation(sources[sourceIdentifier].location, locationAxes)
  //       );
  //     })
  //   );

  //   const locationController = new ObservableController({});
  //   locationController.addListener((event) => {
  //     validateInput();
  //   });

  //   const { contentElement, warningElement } = this._sourcePropertiesContentElement(
  //     locationAxes,
  //     nameController,
  //     locationController
  //   );

  //   const disable = nameController.model.sourceName ? false : true;

  //   const dialog = await dialogSetup("Add font source", null, [
  //     { title: "Cancel", isCancelButton: true },
  //     { title: "Add", isDefaultButton: true, disabled: disable },
  //   ]);
  //   dialog.setContent(contentElement);

  //   setTimeout(
  //     () => contentElement.querySelector("#font-source-name-text-input")?.focus(),
  //     0
  //   );

  //   validateInput();

  //   if (!(await dialog.run())) {
  //     // User cancelled
  //     return;
  //   }

  //   let newLocation = makeSparseLocation(locationController.model, locationAxes);
  //   for (const axis of locationAxes) {
  //     if (!(axis.name in newLocation)) {
  //       newLocation[axis.name] = axis.defaultValue;
  //     }
  //   }

  //   const interpolatedSource = getInterpolatedSourceData(
  //     this.fontController,
  //     newLocation
  //   );

  //   const newCrossAxisMapping = {
  //     name: nameController.model.sourceName.trim(),
  //     location: newLocation,
  //   };

  //   if (interpolatedSource.lineMetricsHorizontalLayout) {
  //     newCrossAxisMapping.lineMetricsHorizontalLayout = getLineMetricsHorRounded(
  //       interpolatedSource.lineMetricsHorizontalLayout
  //     );
  //   }

  //   return {
  //     lineMetricsHorizontalLayout: getDefaultLineMetricsHor(
  //       this.fontController.unitsPerEm
  //     ),
  //     ...interpolatedSource,
  //     ...newCrossAxisMapping,
  //   };
  // }

  // getSourceName(sources) {
  //   const sourceNames = Object.keys(sources).map((sourceIdentifier) => {
  //     return sources[sourceIdentifier].name;
  //   });
  //   let sourceName = "Untitled source";
  //   let i = 1;
  //   while (sourceNames.includes(sourceName)) {
  //     sourceName = `Untitled source ${i}`;
  //     i++;
  //   }
  //   return sourceName;
  // }

  // _sourcePropertiesContentElement(locationAxes, nameController, locationController) {
  //   const locationElement = html.createDomElement("designspace-location", {
  //     style: `grid-column: 1 / -1;
  //       min-height: 0;
  //       overflow: auto;
  //       height: 100%;
  //     `,
  //   });
  //   locationElement.axes = locationAxes;
  //   locationElement.controller = locationController;

  //   const containerContent = [
  //     ...labeledTextInput("Source name:", nameController, "sourceName", {}),
  //     html.br(),
  //     locationElement,
  //   ];

  //   const warningElement = html.div({
  //     id: "warning-text",
  //     style: `grid-column: 1 / -1; min-height: 1.5em;`,
  //   });
  //   containerContent.push(warningElement);

  //   const contentElement = html.div(
  //     {
  //       style: `overflow: hidden;
  //         white-space: nowrap;
  //         display: grid;
  //         gap: 0.5em;
  //         grid-template-columns: max-content auto;
  //         align-items: center;
  //         height: 100%;
  //         min-height: 0;
  //       `,
  //     },
  //     containerContent
  //   );

  //   return { contentElement, warningElement };
  // }
}

addStyleSheet(`
:root {
  --fontra-ui-font-info-cross-axis-mapping-panel-max-list-height: 12em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: max-content max-content max-content max-content max-content auto;
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
}

.fontra-ui-font-info-cross-axis-mapping-panel-column-location {
  display: grid;
  grid-template-columns: max-content;
  gap: 0.5em;
  overflow: hidden;
}

fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-column.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-column-location.min-height {
  height: 45px;
}

.fontra-ui-font-info-cross-axis-mapping-panel-header {
  font-weight: bold;
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
  constructor(fontAxesSourceSpace, mapping, postChange, setupUI) {
    super();
    this.classList.add(
      "fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box"
    );
    this.draggable = true;
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.mapping = mapping;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this.controllers = {};
    this.models = this._getModels();
    this._updateContents();
  }

  _getModels() {
    const mapping = this.mapping;
    return {
      general: {
        description: mapping.description || "",
        groupDescription: mapping.groupDescription || "",
      },
      inputLocation: { ...mapping.inputLocation },
      outputLocation: { ...mapping.outputLocation },
    };
  }

  editCrossAxisMapping(editFunc, undoLabel) {
    console.log("editCrossAxisMapping");

    // const root = { mappings: this.mappings };
    // const changes = recordChanges(root, (root) => {
    //   editFunc(root.mappings[this.mappingIdentifier]);
    // });
    // if (changes.hasChange) {
    //   this.postChange(changes.change, changes.rollbackChange, undoLabel);
    // }
  }

  deleteCrossAxisMapping() {
    console.log("deleteCrossAxisMapping");

    // const undoLabel = `delete mapping '${this.mapping.description || "unnamed"}'`;
    // const root = { mappings: this.mappings };
    // const changes = recordChanges(root, (root) => {
    //   delete root.mappings[this.mappingIdentifier];
    // });
    // if (changes.hasChange) {
    //   this.postChange(changes.change, changes.rollbackChange, undoLabel);
    //   this.setupUI();
    // }
  }

  toggleShowHide() {
    const element = this.querySelector("#open-close-icon");
    element.classList.toggle("item-closed");

    for (const child of this.children) {
      child.classList.toggle("min-height");
    }
  }

  _updateContents() {
    const models = this.models;

    // create controllers
    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
    }

    // create listeners
    this.controllers.general.addListener((event) => {
      if (event.key == "description" || event.key == "groupDescription") {
        if (typeof event.newValue != "string") {
          // TODO: check if this is correct, must be string
          return;
        }
        // if (!this.checkSourceEntry("name", undefined, event.newValue.trim())) {
        //   return;
        // }
      }
      this.editCrossAxisMapping((mapping) => {
        mapping[event.key] = event.newValue.trim();
      }, `edit cross-axis-mapping general ${event.key}`);
    });

    this.controllers.inputLocation.addListener((event) => {
      // if (!this.checkSourceLocation(event.key, event.newValue)) {
      //   return;
      // }
      this.editCrossAxisMapping((mapping) => {
        mapping.inputLocation[event.key] = event.newValue;
      }, `edit input location ${event.key}`);
    });

    this.controllers.outputLocation.addListener((event) => {
      // if (!this.checkSourceLocation(event.key, event.newValue)) {
      //   return;
      // }
      this.editCrossAxisMapping((mapping) => {
        mapping.outputLocation[event.key] = event.newValue;
      }, `edit output location ${event.key}`);
    });

    this.innerHTML = "";
    this.append(
      html.createDomElement("icon-button", {
        class:
          "fontra-ui-font-info-cross-axis-mapping-panel-icon open-close-icon item-closed",
        id: "open-close-icon",
        src: "/tabler-icons/chevron-up.svg",
        open: false,
        onclick: (event) => this.toggleShowHide(),
      })
    );

    for (const key of ["general", "", "inputLocation", "outputLocation"]) {
      this.append(
        html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-header" }, [
          getLabelFromKey(key),
        ])
      );
    }

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-cross-axis-mapping-panel-icon",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteCrossAxisMapping(),
        "data-tooltip": "Delete source",
        "data-tooltipposition": "left",
      })
    );

    this.append(html.div()); // empty cell for grid with arrow

    this.append(buildElement(this.controllers.general));
    this.append(buildElementLocationsLabel(this.fontAxesSourceSpace));
    this.append(
      buildElementLocations(this.controllers.inputLocation, this.fontAxesSourceSpace)
    );
    this.append(
      buildElementLocations(this.controllers.outputLocation, this.fontAxesSourceSpace)
    );
  }
}

customElements.define("cross-axis-mapping-box", CrossAxisMappingBox);

function buildElement(controller) {
  let items = [];
  for (const key in controller.model) {
    items.push([getLabelFromKey(key), key, controller.model[key]]);
  }

  return html.div(
    { class: "fontra-ui-font-info-cross-axis-mapping-panel-column min-height" },
    items
      .map(([labelName, keyName, value]) => {
        if (typeof value === "boolean") {
          return [html.div(), labeledCheckbox(labelName, controller, keyName, {})];
        } else {
          return labeledTextInput(labelName, controller, keyName, {
            continuous: false,
          });
        }
      })
      .flat()
  );
}

function buildElementLocations(controller, fontAxes) {
  const locationElement = html.createDomElement("designspace-location", {
    continuous: false,
    labels: false,
    class: `fontra-ui-font-info-cross-axis-mapping-panel-column-location min-height`,
  });
  locationElement.axes = fontAxes;
  locationElement.controller = controller;
  return locationElement;
}

function buildElementLocationsLabel(fontAxes) {
  let items = [];
  for (const axis of fontAxes) {
    items.push(axis.tag);
  }

  return html.div(
    {
      class: "fontra-ui-font-info-cross-axis-mapping-panel-column-location min-height",
    },
    items
      .map((labelName) => {
        return html.label({ style: "text-align: right;" }, [labelName]);
      })
      .flat()
  );
}

function getLabelFromKey(key) {
  const keyLabelMap = {
    description: translate("Description"), // key: cross-axis-mapping.description
    groupDescription: translate("Group Description"), // key: cross-axis-mapping.groupDescription
  };
  return keyLabelMap[key] || key;
}
