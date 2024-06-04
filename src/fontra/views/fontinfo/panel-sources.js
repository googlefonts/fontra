import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import {
  NumberFormatter,
  OptionalNumberFormatter,
  checkboxListCell,
  labeledTextInput,
  labeledTextInputMultiValues,
  setupSortableList,
} from "../core/ui-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import {
  isLocationAtDefault,
  locationToString,
  makeSparseLocation,
  mapAxesFromUserSpaceToSourceSpace,
  piecewiseLinearMap,
} from "/core/var-model.js";
import "/web-components/add-remove-buttons.js";
import "/web-components/designspace-location.js";
import { dialogSetup } from "/web-components/modal-dialog.js";

export class SourcesPanel extends BaseInfoPanel {
  static title = "sources.title";
  static id = "sources-panel";
  static fontAttributes = ["sources", "sources"];

  async setupUI() {
    const sources = await getSources(this.fontController);
    const fontAxes = this.fontController.axes.axes;

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const [identifier, source] of Object.entries(sources)) {
      console.log("source", identifier, source);
      container.appendChild(
        new SourceBox(
          fontAxes,
          sources,
          identifier,
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
        value: "New font source...",
        onclick: (event) => this.newSource(),
      })
    );
    this.panelElement.appendChild(container);
    this.panelElement.focus();
  }

  async newSource() {
    const newSource = await this._sourcePropertiesRunDialog(
      "Add font source",
      "Add",
      this.fontController
    );
    if (!newSource) {
      return;
    }

    const undoLabel = `add source '${newSource.name}'`;
    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (root) => {
      root.sources[newSource.name] = newSource;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  async _sourcePropertiesRunDialog(title, okButtonTitle, fontController) {
    const sources = await getSources(this.fontController);
    const defaultVerticalMetrics = getDefaultVerticalMetrics(this.fontController);
    const validateInput = () => {
      const warnings = [];
      const editedSourceName =
        nameController.model.sourceName || nameController.model.suggestedSourceName;
      if (!editedSourceName.length) {
        warnings.push("⚠️ The source name must not be empty");
      } else if (
        Object.keys(sources)
          .map(function (source) {
            if (source.name === editedSourceName) return true;
          })
          .includes(true)
      ) {
        warnings.push("⚠️ The source name should be unique");
      }
      const locStr = locationToString(
        makeSparseLocation(locationController.model, locationAxes)
      );
      if (sourceLocations.has(locStr)) {
        warnings.push("⚠️ The source location must be unique");
      }
      warningElement.innerText = warnings.length ? warnings.join("\n") : "";
      dialog.defaultButton.classList.toggle("disabled", warnings.length);
    };

    const locationAxes = fontController.axes.axes;

    const suggestedSourceName = "New source name";

    const nameController = new ObservableController({
      sourceName: suggestedSourceName,
      sourceItalicAngle: 0,
      suggestedSourceName: suggestedSourceName,
      suggestedSourceItalicAngle: 0,
    });

    nameController.addKeyListener("sourceName", (event) => {
      validateInput();
    });

    const sourceLocations = new Set(
      Object.keys(sources).map((key) =>
        locationToString(makeSparseLocation(sources[key].location, locationAxes))
      )
    );

    // if (sourceName.length) {
    //   sourceLocations.delete(
    //     locationToString(makeSparseLocation(location, locationAxes))
    //   );
    // }

    const locationController = new ObservableController({});
    locationController.addListener((event) => {
      validateInput();
    });

    const verticalMetricsController = new ObservableController(defaultVerticalMetrics);
    locationController.addListener((event) => {
      validateInput();
    });

    console.log("verticalMetricsController", verticalMetricsController);

    const { contentElement, warningElement } = this._sourcePropertiesContentElement(
      locationAxes,
      nameController,
      locationController,
      verticalMetricsController
    );

    const disable = nameController.model.sourceName ? false : true;

    const dialog = await dialogSetup(title, null, [
      { title: "Cancel", isCancelButton: true },
      { title: okButtonTitle, isDefaultButton: true, disabled: disable },
    ]);
    dialog.setContent(contentElement);

    setTimeout(
      () => contentElement.querySelector("#font-source-name-text-input")?.focus(),
      0
    );

    validateInput();

    if (!(await dialog.run())) {
      // User cancelled
      return;
    }

    const newLocation = makeSparseLocation(locationController.model, locationAxes);

    const newSource = {
      name: nameController.model.sourceName || nameController.model.suggestedSourceName,
      italicAngle:
        nameController.model.sourceItalicAngle ||
        nameController.model.suggestedSourceItalicAngle,
      location: newLocation,
      verticalMetrics: defaultVerticalMetrics,
    };
    console.log("newSource", newSource);
    return newSource;
  }

  _sourcePropertiesContentElement(
    locationAxes,
    nameController,
    locationController,
    verticalMetricsController
  ) {
    const locationElement = html.createDomElement("designspace-location", {
      style: `grid-column: 1 / -1;
        min-height: 0;
        overflow: auto;
        height: 100%;
      `,
    });
    locationElement.axes = locationAxes;
    locationElement.controller = locationController;

    const containerContent = [
      ...labeledTextInput("Source name:", nameController, "sourceName", {
        placeholderKey: "suggestedSourceName",
      }),
      ...labeledTextInput("Italic Angle:", nameController, "sourceItalicAngle", {
        placeholderKey: "suggestedSourceItalicAngele",
      }),
      html.br(),
      locationElement,
    ];

    // NOTE: I don't think this is necessary, just add a default vertical metrics
    // and if the user wants to change it, they can do it in the source box.
    // KEEP FOR REFERENCE
    // for (const key in verticalMetricsController.model) {
    //   containerContent.push(...labeledTextInputMultiValues(
    //       translate(key),
    //       verticalMetricsController,
    //       key,
    //       {
    //         style: `
    //           // grid-column: 1 / -1;
    //           // min-height: 0px;
    //           // overflow: auto;
    //           // height: 100%;
    //           width: 30%;`,
    //         continuous: false,
    //         valueKeys: ["value", "zone"],
    //         //formatter: NumberFormatter,
    //       }
    //     )
    //   );
    // }

    const warningElement = html.div({
      id: "warning-text",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });
    containerContent.push(warningElement);

    const contentElement = html.div(
      {
        style: `overflow: hidden;
          white-space: nowrap;
          display: grid;
          gap: 0.5em;
          grid-template-columns: max-content auto;
          align-items: center;
          height: 100%;
          min-height: 0;
        `,
      },
      containerContent
    );

    return { contentElement, warningElement };
  }
}

addStyleSheet(`
:root {
  --fontra-ui-font-info-sources-panel-max-list-height: 12em;
}

.fontra-ui-font-info-sources-panel-source-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: max-content max-content auto auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-names {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
}

.fontra-ui-font-info-vertical-metrics {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) 4em 4em;
  gap: 0.5em;
  align-items: start;
  align-content: start;
}

.fontra-ui-font-info-delete {
  justify-self: end;
  align-self: start;
}

select {
  font-family: "fontra-ui-regular";
}

.fontra-ui-font-info-header {
  font-weight: bold;
}
`);

class SourceBox extends HTMLElement {
  constructor(fontAxes, sources, sourceIdentifier, postChange, setupUI) {
    super();
    this.classList.add("fontra-ui-font-info-sources-panel-source-box");
    this.fontAxes = fontAxes;
    this.sources = sources;
    this.sourceIdentifier = sourceIdentifier;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this.controllers = {};
    this._updateContents();
  }

  get source() {
    return this.sources[this.sourceIdentifier];
  }

  get models() {
    const source = this.source;
    return {
      General: {
        name: source.name,
        italicAngle: source.italicAngle ? source.italicAngle : 0,
      },
      location: source.location,
      verticalMetrics: source.verticalMetrics,
    };
    // NOTE: Font guidlines could be read/write here,
    // but makes more sense directly in the glyph editing window.
  }

  editSource(editFunc, undoLabel) {
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      editFunc(root.sources[this.sourceIdentifier]);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      if (undoLabel.includes("verticalMetrics")) {
        this.setupUI();
      }
    }
  }

  replaceSource(newSource, undoLabel) {
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      root.sources[this.sourceIdentifier] = newSource;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  deleteSource() {
    const undoLabel = `delete source '${this.source.name}'`;
    console.log("delete source", undoLabel, this.sourceIdentifier);
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      delete root.sources[this.sourceIdentifier];
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  _updateContents() {
    const models = this.models;

    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
      this.controllers[key].addListener((event) => {
        this.editSource((source) => {
          if (key == "General") {
            source[event.key] = event.newValue;
          } else {
            source[key][event.key] = event.newValue;
          }
        }, `edit source ${key} ${event.key}`);
      });
    }

    this.innerHTML = "";

    for (const key in models) {
      this.append(html.div({ class: "fontra-ui-font-info-header" }, [translate(key)]));
    }

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-delete",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteSource(),
        "data-tooltip": translate("sources.delete-source"),
        "data-tooltipposition": "left",
      })
    );

    for (const key in models) {
      if (key == "location") {
        const htmlElement = buildElementLocations(this.controllers[key], this.fontAxes);
        this.append(htmlElement);
        continue;
      }
      if (key == "verticalMetrics") {
        const htmlElement = buildElementVerticalMetrics(this.controllers[key]);
        this.append(htmlElement);
        continue;
      }
      this.append(buildElement(this.controllers[key]));
    }
  }
}

customElements.define("source-box", SourceBox);

function buildElement(controller, options = {}) {
  let itemsArray = Object.keys(controller.model).map(function (key) {
    return [key, controller.model[key]];
  });
  itemsArray.sort((a, b) => b[1].value - a[1].value);

  let items = [];
  for (const [key, value] of itemsArray) {
    items.push([translate(key), key]);
  }

  return html.div(
    { class: "fontra-ui-font-info-names" },
    items
      .map(([labelName, keyName]) =>
        labeledTextInput(labelName, controller, keyName, {
          continuous: false,
        })
      )
      .flat()
  );
}

function buildElementVerticalMetrics(controller, options = {}) {
  let itemsArray = Object.keys(controller.model).map(function (key) {
    return [key, controller.model[key]];
  });
  itemsArray.sort((a, b) => b[1].value - a[1].value);

  let items = [];
  for (const [key, value] of itemsArray) {
    items.push([translate(key), key]);
  }

  return html.div(
    { class: "fontra-ui-font-info-vertical-metrics" },
    items
      .map(([labelName, keyName]) =>
        labeledTextInputMultiValues(labelName, controller, keyName, {
          continuous: false,
          valueKeys: ["value", "zone"],
          formatter: OptionalNumberFormatter,
        })
      )
      .flat()
  );
}

function buildElementLocations(controller, fontAxes) {
  const locationElement = html.createDomElement("designspace-location", {
    class: `fontra-ui-font-info-names`,
  });
  locationElement.axes = fontAxes;
  locationElement.controller = controller;
  return locationElement;
}

async function getSources(fontController) {
  const sources = await fontController.getSources();
  if (Object.keys(sources).length > 0) {
    return sources;
  }
  return {};
}

const verticalMetricsDefaults = {
  ascender: { value: 0.75, zone: 0.016 },
  capHeight: { value: 0.75, zone: 0.016 },
  xHeight: { value: 0.5, zone: 0.016 },
  baseline: { value: 0, zone: -0.016 },
  descender: { value: -0.25, zone: -0.016 },
};

function getDefaultVerticalMetrics(fontController) {
  const source = Object.values(fontController.sources)[0];
  let defaultSourceVerticalMetrics = {};
  if (source) {
    defaultSourceVerticalMetrics = source.verticalMetrics;
  }
  const unitsPerEm = fontController.unitsPerEm;
  const defaultVerticalMetrics = {};
  for (const [name, defaultFactor] of Object.entries(verticalMetricsDefaults)) {
    const value = Math.round(defaultFactor.value * unitsPerEm);
    const zone = Math.round(defaultFactor.zone * unitsPerEm);
    defaultVerticalMetrics[name] = { value: value, zone: zone };
  }

  return { ...defaultVerticalMetrics, ...defaultSourceVerticalMetrics };
}
