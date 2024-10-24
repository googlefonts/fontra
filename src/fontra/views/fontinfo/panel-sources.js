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
import { enumerate, round } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import {
  locationToString,
  makeSparseLocation,
  mapAxesFromUserSpaceToSourceSpace,
} from "/core/var-model.js";
import "/web-components/add-remove-buttons.js";
import "/web-components/designspace-location.js";
import { dialogSetup, message } from "/web-components/modal-dialog.js";

const cardsInfos = {};

export class SourcesPanel extends BaseInfoPanel {
  static title = "sources.title";
  static id = "sources-panel";
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
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const identifier of sortedSourceIdentifiers(
      sources,
      this.fontAxesSourceSpace
    )) {
      if (!cardsInfos[identifier]) {
        cardsInfos[identifier] = {};
      }
      container.appendChild(
        new SourceBox(
          this.fontAxesSourceSpace,
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

    let sourceIdentifier;
    do {
      sourceIdentifier = crypto.randomUUID().slice(0, 8);
    } while (sourceIdentifier in this.fontController.sources);

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
    const locationAxes = this.fontAxesSourceSpace;
    const validateInput = () => {
      const warnings = [];
      const editedSourceName = nameController.model.sourceName;
      if (!editedSourceName.length || !editedSourceName.trim()) {
        warnings.push("⚠️ The source name must not be empty");
      }
      if (
        Object.keys(sources)
          .map((sourceIdentifier) => {
            if (sources[sourceIdentifier].name === editedSourceName.trim()) {
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

    const nameController = new ObservableController({
      sourceName: this.getSourceName(sources),
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

    const newSource = {
      name: nameController.model.sourceName.trim(),
      location: newLocation,
    };

    if (interpolatedSource.lineMetricsHorizontalLayout) {
      newSource.lineMetricsHorizontalLayout = getLineMetricsHorRounded(
        interpolatedSource.lineMetricsHorizontalLayout
      );
    }

    return {
      lineMetricsHorizontalLayout: getDefaultLineMetricsHor(
        this.fontController.unitsPerEm
      ),
      ...interpolatedSource,
      ...newSource,
    };
  }

  getSourceName(sources) {
    const sourceNames = Object.keys(sources).map((sourceIdentifier) => {
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
}

.fontra-ui-font-info-sources-panel-column {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
  overflow: scroll;
}

.fontra-ui-font-info-sources-panel-header.min-height,
.fontra-ui-font-info-sources-panel-source-box.min-height,
.fontra-ui-font-info-sources-panel-column.min-height {
  height: 0;
  display: none;
}

.fontra-ui-font-info-sources-panel-line-metrics-hor {
  grid-template-columns: minmax(4.5em, max-content) 4em 4em;
}

.fontra-ui-font-info-sources-panel-header {
  font-weight: bold;
}

.fontra-ui-font-info-sources-panel-icon {
  justify-self: end;
  align-self: start;
}

.fontra-ui-font-info-sources-panel-icon.open-close-icon {
  height: 1.5em;
  width: 1.5em;
  transition: 120ms;
}

.fontra-ui-font-info-sources-panel-icon.open-close-icon.item-closed {
  transform: rotate(180deg);
}

.fontra-ui-font-info-sources-panel-oneliner > .source-name {
  color: var(--foreground-color);
  font-weight: bold;
  margin-right: 1em;
}

.fontra-ui-font-info-sources-panel-oneliner > .not-default {
    color: var(--foreground-color);
}

.fontra-ui-font-info-sources-panel-oneliner {
  color: #888;
  display: none;
}

.fontra-ui-font-info-sources-panel-oneliner.min-height {
  display: block;
  align-content: center;
  grid-column-start: span 3;
}

`);

class SourceBox extends HTMLElement {
  constructor(fontAxesSourceSpace, sources, sourceIdentifier, postChange, setupUI) {
    super();
    this.classList.add("fontra-ui-font-info-sources-panel-source-box");
    this.fontAxesSourceSpace = fontAxesSourceSpace;
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
        //isSparse: source.isSparse ? source.isSparse : false,
      },
      location: { ...source.location },
      lineMetricsHorizontalLayout: prepareLineMetricsHorForController(
        source.lineMetricsHorizontalLayout
      ),
      // TODO: hhea, OS/2 line metrics, etc
      // customData: { ...source.customData },
    };
    // NOTE: Font guidelines could be read/write here,
    // but makes more sense directly in the glyph editing window.
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
      let thisSourceValue = value;

      if (valueKey == undefined) {
        if (key == "location") {
          sourceValue = locationToString(source[key]);
          thisSourceValue = locationToString(value);
        } else {
          sourceValue = source[key];
        }
      } else {
        sourceValue = source[key][valueKey];
      }

      if (sourceValue == thisSourceValue) {
        existsAlready = true;
      }

      if (existsAlready) {
        errorMessage = `${key}${valueKey ? " " + valueKey : ""}: “${thisSourceValue}”
          exists already, please use a different value.`;
        break;
      }
    }

    if (errorMessage) {
      message(`Can’t edit font source`, errorMessage);
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

  toggleShowHide(altKey) {
    const cardElements = !altKey
      ? [this]
      : document.querySelectorAll(".fontra-ui-font-info-sources-panel-source-box");

    const thisIconElement = this.querySelector("#open-close-icon");
    const isClosed = thisIconElement.classList.contains("item-closed");

    for (const cardElement of cardElements) {
      const elementIcon = cardElement.querySelector("#open-close-icon");
      if (isClosed) {
        cardsInfos[cardElement.sourceIdentifier].isClosed = false;
        cardElement.classList.remove("item-closed");
        elementIcon.classList.remove("item-closed");
        for (const child of cardElement.children) {
          child.classList.remove("min-height");
        }
      } else {
        cardsInfos[cardElement.sourceIdentifier]["isClosed"] = true;
        cardElement.classList.add("item-closed");
        elementIcon.classList.add("item-closed");
        for (const child of cardElement.children) {
          child.classList.add("min-height");
        }
      }
    }
  }

  getOneliner() {
    const onelinerElement = html.div({
      class: "fontra-ui-font-info-sources-panel-oneliner",
    });
    onelinerElement.appendChild(
      html.span({ class: "source-name" }, [this.source.name])
    );

    for (const [i, axis] of enumerate(this.fontAxesSourceSpace)) {
      if (i > 0) {
        onelinerElement.append(", ");
      }
      const axisElement = document.createElement("span");
      const sourceLocationValue = round(
        this.source.location.hasOwnProperty(axis.name)
          ? this.source.location[axis.name]
          : axis.defaultValue,
        2
      );
      axisElement.innerText = `${axis.name}=${sourceLocationValue}`;

      if (axis.defaultValue != sourceLocationValue) {
        axisElement.classList.add("not-default");
      }
      onelinerElement.appendChild(axisElement);
    }

    return onelinerElement;
  }

  _updateContents() {
    const models = this.models;

    // create controllers
    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
    }

    // create listeners
    this.controllers.general.addListener((event) => {
      if (event.key == "name") {
        if (!this.checkSourceEntry("name", undefined, event.newValue.trim())) {
          this.controllers.general.model.name = this.source.name;
          return;
        }
      }
      this.editSource((source) => {
        if (typeof event.newValue == "string") {
          source[event.key] = event.newValue.trim();
        } else {
          source[event.key] = event.newValue;
        }
      }, `edit source general ${event.key}`);
    });

    this.controllers.location.addListener((event) => {
      if (!this.checkSourceLocation(event.key, event.newValue)) {
        this.controllers.location.model[event.key] = this.source.location[event.key];
        return;
      }
      this.editSource((source) => {
        source.location[event.key] = event.newValue;
      }, `edit source location ${event.key}`);
    });

    this.controllers.lineMetricsHorizontalLayout.addListener((event) => {
      this.editSource((source) => {
        if (event.key.startsWith("value-")) {
          source.lineMetricsHorizontalLayout[event.key.slice(6)].value = event.newValue;
        } else {
          source.lineMetricsHorizontalLayout[event.key.slice(5)].zone = event.newValue;
        }
      }, `edit source line metrics ${event.key}`);
    });

    this.innerHTML = "";
    this.append(
      html.createDomElement("icon-button", {
        class: "fontra-ui-font-info-sources-panel-icon open-close-icon",
        id: "open-close-icon",
        src: "/tabler-icons/chevron-up.svg",
        open: false,
        onclick: (event) => this.toggleShowHide(event.altKey),
      })
    );

    // This is the oneliner for the folded card –> only visible when folded.
    this.append(this.getOneliner());

    for (const key in models) {
      this.append(
        html.div({ class: "fontra-ui-font-info-sources-panel-header" }, [
          getLabelFromKey(key),
        ])
      );
    }

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-sources-panel-icon",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteSource(),
        "data-tooltip": "Delete source",
        "data-tooltipposition": "left",
      })
    );

    this.append(html.div()); // empty cell for grid with arrow

    this.append(buildElement(this.controllers.general));
    this.append(
      buildElementLocations(this.controllers.location, this.fontAxesSourceSpace)
    );
    this.append(
      buildElementLineMetricsHor(this.controllers.lineMetricsHorizontalLayout)
    );

    const isClosed = !!cardsInfos[this.sourceIdentifier].isClosed;
    if (isClosed) {
      this.toggleShowHide(false);
    }
  }
}

customElements.define("source-box", SourceBox);

function sortedSourceIdentifiers(sources, fontAxes) {
  const sortFunc = (identifierA, identifierB) => {
    for (const axis of fontAxes) {
      const valueA = sources[identifierA].location[axis.name];
      const valueB = sources[identifierB].location[axis.name];
      if (valueA === valueB) {
        continue;
      }
      return valueA < valueB ? -1 : 0;
    }
    return 0;
  };
  return Object.keys(sources).sort(sortFunc);
}

function buildElement(controller) {
  let items = [];
  for (const key in controller.model) {
    items.push([getLabelFromKey(key), key, controller.model[key]]);
  }

  return html.div(
    { class: "fontra-ui-font-info-sources-panel-column" },
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

function buildElementLineMetricsHor(controller) {
  let items = [];
  for (const key of Object.keys(lineMetricsHorizontalLayoutDefaults)) {
    if (`value-${key}` in controller.model) {
      items.push([getLabelFromKey(key), key]);
    }
  }
  // TODO: Custom line metrics

  return html.div(
    {
      class:
        "fontra-ui-font-info-sources-panel-column fontra-ui-font-info-sources-panel-line-metrics-hor",
    },
    items
      .map(([labelName, keyName]) => {
        const opts = { continuous: false, formatter: OptionalNumberFormatter };
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
    class: `fontra-ui-font-info-sources-panel-column`,
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

const lineMetricsHorizontalLayoutDefaults = {
  ascender: { value: 0.8, zone: 0.016 },
  capHeight: { value: 0.75, zone: 0.016 },
  xHeight: { value: 0.5, zone: 0.016 },
  baseline: { value: 0, zone: -0.016 },
  descender: { value: -0.25, zone: -0.016 },
};

function getDefaultLineMetricsHor(unitsPerEm) {
  const lineMetricsHorizontalLayout = {};
  for (const [name, defaultFactor] of Object.entries(
    lineMetricsHorizontalLayoutDefaults
  )) {
    const value = Math.round(defaultFactor.value * unitsPerEm);
    const zone = Math.round(defaultFactor.zone * unitsPerEm);
    lineMetricsHorizontalLayout[name] = { value: value, zone: zone };
  }
  return lineMetricsHorizontalLayout;
}

function prepareLineMetricsHorForController(lineMetricsHorizontalLayout) {
  const newLineMetricsHorizontalLayout = {};
  for (const key in lineMetricsHorizontalLayout) {
    newLineMetricsHorizontalLayout[`value-${key}`] =
      lineMetricsHorizontalLayout[key].value;
    newLineMetricsHorizontalLayout[`zone-${key}`] =
      lineMetricsHorizontalLayout[key].zone | 0;
  }
  return newLineMetricsHorizontalLayout;
}

function getLineMetricsHorRounded(lineMetricsHorizontalLayout) {
  const newLineMetricsHorizontalLayout = {};
  for (const key in lineMetricsHorizontalLayout) {
    newLineMetricsHorizontalLayout[key] = {
      value: round(lineMetricsHorizontalLayout[key].value, 2),
      zone: round(lineMetricsHorizontalLayout[key].zone, 2) | 0,
    };
  }
  return newLineMetricsHorizontalLayout;
}

function getLabelFromKey(key) {
  // TODO: this may use translate in future
  const keyLabelMap = {
    name: "Name",
    italicAngle: "Italic Angle",
    isSparse: "Is Sparse",
    ascender: "Ascender",
    capHeight: "Cap Height",
    xHeight: "x-Height",
    baseline: "Baseline",
    descender: "Descender",
    general: "General",
    location: "Location",
    lineMetricsHorizontalLayout: "Line metrics",
  };
  return keyLabelMap[key] || key;
}
