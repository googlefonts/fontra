import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import {
  OptionalNumberFormatter,
  labelForElement,
  labeledCheckbox,
  labeledTextInput,
  textInput,
} from "../core/ui-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import { locationToString, makeSparseLocation } from "/core/var-model.js";
import "/web-components/add-remove-buttons.js";
import "/web-components/designspace-location.js";
import { dialogSetup, message } from "/web-components/modal-dialog.js";

export class SourcesPanel extends BaseInfoPanel {
  static title = "sources.title";
  static id = "sources-panel";
  static fontAttributes = ["axes", "sources"];

  async setupUI() {
    const sources = await this.fontController.getSources();
    const fontAxes = this.fontController.axes.axes;

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    // TODO: maybe sort sources by axes and location values
    for (const identifier of Object.keys(sources)) {
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
    const newSource = await this._sourcePropertiesRunDialog();
    if (!newSource) {
      return;
    }

    const undoLabel = `add source '${newSource.name}'`;
    const sourceIdentifier = newSource.name;
    // TODO: Maybe use proper sourceIdentifier, not source name
    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (root) => {
      root.sources[sourceIdentifier] = newSource;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  async _sourcePropertiesRunDialog() {
    const sources = await this.fontController.getSources();
    const locationAxes = this.fontController.axes.axes;
    const validateInput = () => {
      const warnings = [];
      const editedSourceName = nameController.model.sourceName;
      if (!editedSourceName.length || !editedSourceName.trim()) {
        warnings.push("⚠️ The source name must not be empty");
      }
      if (
        Object.keys(sources)
          .map(function (sourceIdentifier) {
            if (sources[sourceIdentifier].name === editedSourceName.trim()) {
              return true;
            }
          })
          .includes(true)
      ) {
        warnings.push("⚠️ The source name should be unique");
      }
      const editedItalicAngle = nameController.model.sourceItalicAngle;
      if (isNaN(editedItalicAngle)) {
        warnings.push("⚠️ The italic angle must be a number");
      }
      if (editedItalicAngle < -90 || editedItalicAngle > 90) {
        warnings.push("⚠️ The italic angle must be between -90 and +90");
      }
      if (editedItalicAngle === "") {
        warnings.push("⚠️ The italic angle must not be empty");
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

    const nameController = new ObservableController({
      sourceName: this.getSourceName(sources),
      sourceItalicAngle: 0,
    });

    nameController.addKeyListener("sourceName", (event) => {
      validateInput();
    });

    nameController.addKeyListener("sourceItalicAngle", (event) => {
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

    const dialog = await dialogSetup("Add font source", null, [
      { title: "Cancel", isCancelButton: true },
      { title: "Add", isDefaultButton: true, disabled: disable },
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
    for (const axis of locationAxes) {
      if (!(axis.name in newLocation)) {
        newLocation[axis.name] = axis.defaultValue;
      }
    }

    const interpolatedSource = getInterpolatedSourceData(
      this.fontController,
      newLocation
    );
    // TODO: round the interpolated vertical metrics to 2 decimal places
    const newSource = {
      name: nameController.model.sourceName.trim(),
      italicAngle: nameController.model.sourceItalicAngle,
      location: newLocation,
    };
    return {
      verticalMetrics: getDefaultVerticalMetrics(this.fontController.unitsPerEm),
      ...interpolatedSource,
      ...newSource,
    };
  }

  getSourceName(sources) {
    const sourceNames = Object.keys(sources).map(function (sourceIdentifier) {
      return sources[sourceIdentifier].name;
    });
    let sourceName = "Untitled source";
    let i = 1;
    while (sourceNames.includes(sourceName)) {
      sourceName = `Untitled source ${i}`;
      i++;
    }
    return sourceName;
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
      ...labeledTextInput("Source name:", nameController, "sourceName", {}),
      ...labeledTextInput("Italic Angle:", nameController, "sourceItalicAngle", {}),
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
  grid-template-columns: max-content max-content max-content max-content auto;
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

.fontra-ui-font-info-header {
  font-weight: bold;
}

.fontra-ui-font-info-icon {
  justify-self: end;
  align-self: start;
}

.open-close-icon {
  height: 1.5em;
  width: 1.5em;
  transition: 120ms;
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
    this.models = this._getModels();
    this._updateContents();
  }

  get source() {
    return this.sources[this.sourceIdentifier];
  }

  _getModels() {
    const source = this.source;
    return {
      general: {
        name: source.name,
        italicAngle: source.italicAngle ? source.italicAngle : 0,
        //isSparce: source.isSparce ? source.isSparce : false,
      },
      location: { ...source.location },
      verticalMetrics: this.prepareVerticalMetricsForController(source.verticalMetrics),
      // TODO: hhea, OS/2 verticalMetrics, etc
      // customData: { ...source.customData },
    };
    // NOTE: Font guidlines could be read/write here,
    // but makes more sense directly in the glyph editing window.
  }

  prepareVerticalMetricsForController(verticalMetrics) {
    let newVerticalMetrics = {};
    for (const key in verticalMetrics) {
      newVerticalMetrics[`value-${key}`] = verticalMetrics[key].value;
      newVerticalMetrics[`zone-${key}`] = verticalMetrics[key].zone;
    }
    return newVerticalMetrics;
  }

  checkSourceLocation(axisName, value) {
    const newLocation = { ...this.source.location, [axisName]: value };
    return this.checkSourceEntry("location", undefined, newLocation);
  }

  checkSourceEntry(key, valueKey = undefined, value) {
    let errorMessage = "";
    for (const sourceIdentifier in this.sources) {
      if (sourceIdentifier == this.sourceIdentifier) {
        // skip the current source
        continue;
      }
      const source = this.sources[sourceIdentifier];

      let existsAlready = false;
      let sourceValue;

      if (valueKey == undefined) {
        if (key == "location") {
          sourceValue = locationToString(source[key]);
          value = locationToString(value);
        } else {
          sourceValue = source[key];
        }
      } else {
        sourceValue = source[key][valueKey];
      }

      if (sourceValue == value) {
        existsAlready = true;
      }

      if (existsAlready) {
        errorMessage = `${key}${valueKey ? " " + valueKey : ""}: “${value}”
          exists already, please use a different value.`;
        break;
      }
    }

    if (errorMessage) {
      message(`Can’t edit font source`, errorMessage);
      this.setupUI();
      return false;
    }
    return true;
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
        if (key == "location") {
          if (!this.checkSourceLocation(event.key, event.newValue)) {
            return;
          }
        }

        if (event.key == "name") {
          if (!this.checkSourceEntry("name", undefined, event.newValue.trim())) {
            return;
          }
        }

        this.editSource((source) => {
          if (key == "general") {
            if (typeof event.key == "string") {
              source[event.key] = event.newValue.trim();
            } else {
              source[event.key] = event.newValue;
            }
          } else {
            if (key == "verticalMetrics") {
              if (event.key.startsWith("value-")) {
                source[key][event.key.slice(6)].value = event.newValue;
              } else {
                source[key][event.key.slice(5)].zone = event.newValue;
              }
            } else {
              source[key][event.key] = event.newValue;
            }
          }
        }, `edit source ${key} ${event.key}`);
      });
    }

    this.innerHTML = "";
    this.append(
      html.createDomElement("icon-button", {
        class: "fontra-ui-font-info-icon open-close-icon",
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
        this.append(buildElementLocations(this.controllers[key], this.fontAxes));
        continue;
      }
      if (key == "verticalMetrics") {
        this.append(buildElementVerticalMetrics(this.controllers[key]));
        continue;
      }
      this.append(buildElement(this.controllers[key]));
    }
  }
}

customElements.define("source-box", SourceBox);

function buildElement(controller) {
  let items = [];
  for (const key in controller.model) {
    items.push([translate(key), key, controller.model[key]]);
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

function buildElementVerticalMetrics(controller) {
  let items = [];
  for (const key of Object.keys(verticalMetricsDefaults)) {
    if (`value-${key}` in controller.model) {
      items.push([translate(key), key]);
    }
  }
  // TODO: Custom vertical metrics

  return html.div(
    { class: "fontra-ui-font-info-column fontra-ui-font-info-vertical-metrics" },
    items
      .map(([labelName, keyName]) => {
        const opts = { continuous: false };
        const valueInput = textInput(controller, `value-${keyName}`, opts);
        const zoneInput = textInput(controller, `zone-${keyName}`, opts);
        return [labelForElement(labelName, valueInput), valueInput, zoneInput];
      })
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

function getInterpolatedSourceData(fontController, newLocation) {
  const fontSourceInstance =
    fontController.fontSourcesInstancer.instantiate(newLocation);
  if (!fontSourceInstance) {
    // This happens if there is no source specified, yet.
    return {};
  }
  // TODO: figure out how to handle this case,
  // because it should not happen, but it does.
  // if (!fontSourceInstance.name) {
  //   throw new Error(`assert -- interpolated font source name is NULL.`);
  // }

  // TODO: ensure that instancer returns a copy of the source
  return JSON.parse(JSON.stringify(fontSourceInstance));
}

const verticalMetricsDefaults = {
  ascender: { value: 0.8, zone: 0.016 },
  capHeight: { value: 0.75, zone: 0.016 },
  xHeight: { value: 0.5, zone: 0.016 },
  baseline: { value: 0, zone: -0.016 },
  descender: { value: -0.25, zone: -0.016 },
};

function getDefaultVerticalMetrics(unitsPerEm) {
  const defaultVerticalMetrics = {};
  for (const [name, defaultFactor] of Object.entries(verticalMetricsDefaults)) {
    const value = Math.round(defaultFactor.value * unitsPerEm);
    const zone = Math.round(defaultFactor.zone * unitsPerEm);
    defaultVerticalMetrics[name] = { value: value, zone: zone };
  }

  return defaultVerticalMetrics;
}
