import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import {
  OptionalNumberFormatter,
  labeledCheckbox,
  labeledTextInput,
  labeledTextInputMultiValues,
} from "../core/ui-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import { locationToString, makeSparseLocation } from "/core/var-model.js";
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
    const sourceIdentifier = newSource.name;
    // NOTE: Not sure if newSource.name is the best sourceIdentifier
    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (root) => {
      root.sources[sourceIdentifier] = newSource;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  async _sourcePropertiesRunDialog(title, okButtonTitle, fontController) {
    const sources = await getSources(this.fontController);
    const validateInput = () => {
      const warnings = [];
      const editedSourceName = nameController.model.sourceName;
      if (!editedSourceName.length) {
        warnings.push("⚠️ The source name must not be empty");
      }
      if (
        Object.keys(sources)
          .map(function (sourceIdentifier) {
            if (sources[sourceIdentifier].name === editedSourceName) {
              return true;
            }
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

    const nameController = new ObservableController({
      sourceName: "New source name",
      sourceItalicAngle: 0,
      suggestedSourceName: "New source name",
      suggestedSourceItalicAngle: 0,
    });

    nameController.addKeyListener("sourceName", (event) => {
      validateInput();
    });

    const sourceLocations = new Set(
      Object.keys(sources).map((sourceIdentifier) => {
        return locationToString(
          makeSparseLocation(sources[sourceIdentifier].location, locationAxes)
        );
      })
    );

    const locationController = new ObservableController({});
    locationController.addListener((event) => {
      validateInput();
    });

    const { contentElement, warningElement } = this._sourcePropertiesContentElement(
      locationAxes,
      nameController,
      locationController
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

    let newLocation = makeSparseLocation(locationController.model, locationAxes);
    if (Object.keys(newLocation).length === 0) {
      for (const axis of locationAxes) {
        newLocation[axis.name] = axis.defaultValue;
      }
    }
    const newSource = {
      name: nameController.model.sourceName || nameController.model.suggestedSourceName,
      italicAngle:
        nameController.model.sourceItalicAngle ||
        nameController.model.suggestedSourceItalicAngle,
      location: newLocation,
      verticalMetrics: getDefaultVerticalMetrics(this.fontController, newLocation),
    };
    return newSource;
  }

  _sourcePropertiesContentElement(locationAxes, nameController, locationController) {
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
  grid-template-columns: max-content max-content max-content auto auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
  max-height: 70px;
}

.fontra-ui-font-info-column {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
  max-height: 50px;
  overflow: scroll;
}

.fontra-ui-font-info-vertical-metrics {
  grid-template-columns: minmax(4.5em, max-content) 4em 4em;
}

.fontra-ui-font-info-icon {
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
      general: {
        name: source.name,
        italicAngle: source.italicAngle ? source.italicAngle : 0,
        //isSparce: source.isSparce ? source.isSparce : false,
      },
      location: source.location,
      verticalMetrics: source.verticalMetrics,
      // TODO: hhea, OS/2 verticalMetrics, etc
      // customData: { ...source.customData },
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
    }
  }

  editSourceVerticalMetrics(editFunc, undoLabel) {
    const root = {
      verticalMetrics: this.sources[this.sourceIdentifier].verticalMetrics,
    };
    const changes = recordChanges(root, (root) => {
      editFunc(root.verticalMetrics);
    });
    console.log("changes", changes);
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  editSourceLocation(editFunc, undoLabel) {
    const root = { location: this.sources[this.sourceIdentifier].location };
    const changes = recordChanges(root, (root) => {
      editFunc(root.location);
    });
    console.log("changes", changes);
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  replaceSource(newSource, undoLabel) {
    console.log("undoLabel", undoLabel);
    console.log("newSource", newSource);
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      root.sources[this.sourceIdentifier] = newSource;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  deleteSource() {
    const undoLabel = `delete source '${this.source.name}'`;
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      delete root.sources[this.sourceIdentifier];
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  toggleShowHide() {
    const el = this.querySelector("#open-close-icon");
    el.style.transform =
      el.style.transform === "rotate(180deg)" ? "rotate(0deg)" : "rotate(180deg)";

    this.style.maxHeight = this.style.maxHeight === "100%" ? "70px" : "100%";
    for (const child of this.children) {
      if (!child.style.maxHeight) {
        child.style.maxHeight = "100%";
      } else {
        delete child.style;
      }
    }
  }

  _updateContents() {
    const models = this.models;

    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
      this.controllers[key].addListener((event) => {
        // this.editSource((source) => {
        //   if (key == "general") {
        //     source[event.key] = event.newValue;
        //   } else {
        //     source[key][event.key] = event.newValue;
        //   }
        // }, `edit source ${key} ${event.key}`);

        console.log("key event", key, event);
        if (key == "general") {
          this.editSource((source) => {
            source[event.key] = event.newValue;
          }, `edit source ${key} ${event.key}`);
        } else {
          const newSource = { ...this.source };
          newSource[key][event.key] = event.newValue;
          this.replaceSource(newSource, `edit source ${key} ${event.key}`);
        }
      });
    }

    this.innerHTML = "";
    this.append(
      html.createDomElement("icon-button", {
        class: "fontra-ui-font-info-icon",
        style: "translate: 120ms; transform: rotate(180deg)",
        id: "open-close-icon",
        src: "/tabler-icons/chevron-up.svg",
        onclick: (event) => this.toggleShowHide(),
      })
    );

    for (const key in models) {
      this.append(html.div({ class: "fontra-ui-font-info-header" }, [translate(key)]));
    }

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-icon",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteSource(),
        "data-tooltip": translate("sources.delete-source"),
        "data-tooltipposition": "left",
      })
    );

    this.append(html.div()); // empty cell for grid with arrow

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
    items.push([translate(key), key, value]);
  }

  return html.div(
    { class: "fontra-ui-font-info-column" },
    items
      .map(([labelName, keyName, value]) => {
        return labeledTextInput(labelName, controller, keyName, {
          continuous: false,
        });
        // TODO for isSparce
        // if (typeof value === "boolean") {
        //   return labeledCheckbox(labelName, controller, keyName, {});
        // } else {
        //   return labeledTextInput(labelName, controller, keyName, {
        //     continuous: false,
        //   })
        // }
      })
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
    { class: "fontra-ui-font-info-column fontra-ui-font-info-vertical-metrics" },
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
    continuous: false,
    class: `fontra-ui-font-info-column`,
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

function getDefaultVerticalMetrics(fontController, newLocation) {
  // TODO:
  // Improvement -> get the interpolated vertical metrics from newLocation
  const source = Object.values(fontController.sources)[0];
  if (source) {
    return source.verticalMetrics;
  }

  const unitsPerEm = fontController.unitsPerEm;
  const defaultVerticalMetrics = {};
  for (const [name, defaultFactor] of Object.entries(verticalMetricsDefaults)) {
    const value = Math.round(defaultFactor.value * unitsPerEm);
    const zone = Math.round(defaultFactor.zone * unitsPerEm);
    defaultVerticalMetrics[name] = { value: value, zone: zone };
  }

  return defaultVerticalMetrics;
}
