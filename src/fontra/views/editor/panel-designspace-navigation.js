import { getAxisBaseName } from "/core/glyph-controller.js";
import { controllerKey, ObservableController } from "/core/observable-object.js";
import { Layer, Source } from "/core/var-glyph.js";
import * as html from "/core/unlit.js";
import { css } from "../third-party/lit.js";
import {
  boolInt,
  enumerate,
  htmlToElement,
  objectsEqual,
  range,
  rgbaToCSS,
  round,
  scheduleCalls,
  throttleCalls,
} from "/core/utils.js";
import {
  locationToString,
  normalizeLocation,
  piecewiseLinearMap,
  mapForward,
} from "/core/var-model.js";
import { showMenu } from "/web-components/menu-panel.js";
import { dialog, dialogSetup } from "/web-components/modal-dialog.js";
import { IconButton } from "/web-components/icon-button.js";
import { InlineSVG } from "/web-components/inline-svg.js";

import { NumberFormatter } from "/web-components/ui-list.js";
import Panel from "./panel.js";

const FONTRA_STATUS_KEY = "fontra.development.status";
const FONTRA_STATUS_DEFINITIONS_KEY = "fontra.sourceStatusFieldDefinitions";

export default class DesignspaceNavigationPanel extends Panel {
  identifier = "designspace-navigation";
  iconPath = "/images/sliders.svg";

  static styles = css`
    #designspace-navigation {
      height: 100%;
      width: 100%;
      padding: 1em;
      display: flex;
      flex-direction: column;
      gap: 0.1em;
      box-sizing: border-box;
    }

    .axis-buttons-container {
      display: flex;
      flex-direction: row;
      gap: 0.2em;
    }

    /* this is to counteract the undesired interaction between button.hidden
       and display: block */
    [hidden] {
      display: none !important;
    }

    icon-button {
      display: block;
      width: 1.5em;
      height: 1.5em;
    }

    hr {
      border: none;
      border-top: 1px solid var(--horizontal-rule-color);
      width: 100%;
      height: 1px;
      grid-column: 1 / -1;
    }

    #sources-list {
      min-height: 100px;
      flex-shrink: 1000;
    }
  `;

  getContentElement() {
    return html.div(
      {
        id: "designspace-navigation",
      },
      [
        html.link({ href: "/css/tooltip.css", rel: "stylesheet" }),
        html.createDomElement(
          "designspace-location",
          {
            id: "designspace-location",
          },
          []
        ),
        html.div({ class: "axis-buttons-container" }, [
          html.createDomElement("icon-button", {
            "id": "reset-axes-button",
            "src": "/tabler-icons/refresh.svg",
            "onclick": (event) => this.resetAllAxesToDefault(event),
            "disabled": false,
            "hidden": true,
            "data-tooltip": "Reset all axes",
          }),
          html.createDomElement("icon-button", {
            "id": "edit-local-axes-button",
            "src": "/tabler-icons/tool.svg",
            "onclick": (event) => this.editLocalAxes(event),
            "data-tooltip": "Edit local axes",
          }),
        ]),
        html.hr(),
        html.createDomElement("ui-list", {
          id: "sources-list",
        }),
        html.createDomElement("add-remove-buttons", {
          id: "sources-list-add-remove-buttons",
        }),
      ]
    );
  }

  attach() {
    this.fontController = this.editorController.fontController;
    this.sceneSettingsController = this.editorController.sceneSettingsController;
    this.sceneSettings = this.editorController.sceneSettingsController.model;
    this.sceneModel = this.editorController.sceneController.sceneModel;
    this.sceneController = this.editorController.sceneController;
    this.updateResetAllAxesButtonState = throttleCalls(
      () => this._updateResetAllAxesButtonState(),
      100
    );
  }

  setup() {
    this.designspaceLocation = this.contentElement.querySelector(
      "#designspace-location"
    );
    this.designspaceLocation.values = this.sceneSettings.location;

    this.designspaceLocation.addEventListener(
      "locationChanged",
      scheduleCalls(async (event) => {
        this.sceneController.scrollAdjustBehavior = "pin-glyph-center";

        this.sceneSettingsController.setItem(
          "location",
          { ...this.designspaceLocation.values },
          { senderID: this }
        );
      })
    );

    this.sceneSettingsController.addKeyListener("selectedGlyphName", (event) => {
      this._updateAxes();
      this._updateSources();
      this._updateEditLocalAxesButtonState();
    });

    this.sceneController.addCurrentGlyphChangeListener(
      scheduleCalls((event) => {
        this._updateAxes();
        this._updateSources();
      }, 100)
    );

    this.sceneSettingsController.addKeyListener("location", (event) => {
      this.updateResetAllAxesButtonState();
      this.updateInterpolationContributions();
      if (event.senderInfo?.senderID === this) {
        // Sent by us, ignore
        return;
      }
      this.designspaceLocation.values = event.newValue;
    });

    this.sceneSettingsController.addKeyListener("selectedSourceIndex", (event) => {
      this.sourcesList.setSelectedItemIndex(event.newValue);
      this._updateRemoveSourceButtonState();
    });

    const columnDescriptions = [
      {
        title: "on",
        key: "active",
        cellFactory: makeIconCellFactory(
          ["/tabler-icons/circle-dotted.svg", "/tabler-icons/circle-dot.svg"],
          true
        ),
        width: "1.2em",
      },
      {
        title: " ",
        key: "interpolationStatus",
        cellFactory: interpolationErrorCell,
        width: "1.2em",
      },
      { key: "name", title: "Source name", width: "12em" },
      {
        title: "bg",
        key: "visible",
        cellFactory: makeIconCellFactory([
          "/tabler-icons/eye-closed.svg",
          "/tabler-icons/eye.svg",
        ]),
        width: "1.2em",
      },
    ];

    const statusFieldDefinitions =
      this.sceneController.sceneModel.fontController.fontLib[
        FONTRA_STATUS_DEFINITIONS_KEY
      ];

    if (statusFieldDefinitions) {
      this.defaultStatusValue = statusFieldDefinitions.find(
        (statusDef) => statusDef.isDefault
      )?.value;
      columnDescriptions.push({
        title: "status",
        key: "status",
        cellFactory: statusListCell,
        width: "3em",
        statusFieldDefinitions: statusFieldDefinitions,
        menuItems: statusFieldDefinitions.map((statusDef) => {
          return {
            title: statusDef.label,
            enabled: () => true,
            statusDef: statusDef,
          };
        }),
      });
    }

    columnDescriptions.push({
      title: " ",
      key: "interpolationContribution",
      cellFactory: interpolationContributionCell,
      width: "1.2em",
    });

    this.sourcesList = this.contentElement.querySelector("#sources-list");
    this.sourcesList.showHeader = true;
    this.sourcesList.columnDescriptions = columnDescriptions;

    this.addRemoveSourceButtons = this.contentElement.querySelector(
      "#sources-list-add-remove-buttons"
    );

    this.addRemoveSourceButtons.addButtonCallback = () => this.addSource();
    this.addRemoveSourceButtons.removeButtonCallback = () =>
      this.removeSource(this.sourcesList.getSelectedItemIndex());
    this.addRemoveSourceButtons.hidden = true;

    this.sourcesList.addEventListener("listSelectionChanged", async (event) => {
      this.sceneController.scrollAdjustBehavior = "pin-glyph-center";
      const sourceIndex = this.sourcesList.getSelectedItemIndex();
      this.sceneSettings.selectedSourceIndex = sourceIndex;
    });

    this.sourcesList.addEventListener("rowDoubleClicked", (event) => {
      this.editSourceProperties(event.detail.doubleClickedRowIndex);
    });

    this._updateAxes();
    this._updateSources();
  }

  resetAllAxesToDefault(event) {
    this.sceneSettings.location = {};
  }

  _updateResetAllAxesButtonState() {
    const location = this.sceneSettings.location;
    let locationEmpty = true;
    for (const axis of this.designspaceLocation.axes) {
      if (
        axis.name &&
        axis.name in location &&
        location[axis.name] !== axis.defaultValue
      ) {
        locationEmpty = false;
        break;
      }
    }
    const button = this.contentElement.querySelector("#reset-axes-button");
    button.disabled = locationEmpty;
    button.hidden = !this.designspaceLocation.axes.length;
  }

  async updateInterpolationContributions() {
    const varGlyphController =
      await this.sceneModel.getSelectedVariableGlyphController();
    if (!varGlyphController) {
      return;
    }
    const interpolationContributions = varGlyphController.getInterpolationContributions(
      this.sceneSettings.location
    );
    for (const [index, sourceItem] of enumerate(this.sourcesList.items)) {
      sourceItem.interpolationContribution = interpolationContributions[index];
    }
  }

  get globalAxes() {
    return this.fontController.globalAxes.filter((axis) => !axis.hidden);
  }

  async _updateAxes() {
    const axes = [...this.globalAxes];
    const varGlyphController =
      await this.sceneModel.getSelectedVariableGlyphController();
    if (varGlyphController) {
      const globalAxisNames = new Set(axes.map((axis) => axis.name));
      const localAxes = getAxisInfoFromGlyph(varGlyphController).filter(
        (axis) => !globalAxisNames.has(axis.name)
      );
      if (localAxes.length) {
        if (axes.length) {
          axes.push({ isDivider: true });
        }
        axes.push(...localAxes);
      }
    }
    this.designspaceLocation.axes = axes;

    this._updateResetAllAxesButtonState();
  }

  async _updateSources() {
    const varGlyphController =
      await this.sceneModel.getSelectedVariableGlyphController();
    const sources = varGlyphController?.sources || [];
    const sourceInterpolationStatus =
      varGlyphController?.sourceInterpolationStatus || [];
    const interpolationContributions =
      varGlyphController?.getInterpolationContributions(this.sceneSettings.location) ||
      [];
    let backgroundLayers = { ...this.sceneController.backgroundLayers };

    const sourceItems = [];
    for (const [index, source] of enumerate(sources)) {
      const layerName = source.layerName;
      const status = source.customData[FONTRA_STATUS_KEY];
      const sourceController = new ObservableController({
        name: source.name,
        active: !source.inactive,
        visible: backgroundLayers[layerName] === source.name,
        status: status !== undefined ? status : this.defaultStatusValue,
        interpolationStatus: sourceInterpolationStatus[index]?.error,
        interpolationContribution: interpolationContributions[index],
      });
      sourceController.addKeyListener("active", async (event) => {
        await this.sceneController.editGlyphAndRecordChanges((glyph) => {
          glyph.sources[index].inactive = !event.newValue;
          return `${event.newValue ? "" : "de"}activate ${source.name}`;
        });
      });
      sourceController.addKeyListener("visible", async (event) => {
        if (event.newValue) {
          backgroundLayers[layerName] = source.name;
        } else {
          delete backgroundLayers[layerName];
        }
        this.sceneController.backgroundLayers = backgroundLayers;
      });
      sourceController.addKeyListener("status", async (event) => {
        await this.sceneController.editGlyphAndRecordChanges((glyph) => {
          glyph.sources[index].customData[FONTRA_STATUS_KEY] = event.newValue;
          return `set status ${source.name}`;
        });
      });
      sourceItems.push(sourceController.model);
    }
    this.sourcesList.setItems(sourceItems, false, true);
    this.sourcesList.setSelectedItemIndex(this.sceneSettings.selectedSourceIndex);
    this.addRemoveSourceButtons.hidden = !sourceItems.length;
    this.addRemoveSourceButtons.disableAddButton =
      !this.designspaceLocation.axes.length;

    this._updateRemoveSourceButtonState();
  }

  _updateRemoveSourceButtonState() {
    this.addRemoveSourceButtons.disableRemoveButton =
      this.sourcesList.getSelectedItemIndex() === undefined;
  }

  async removeSource(sourceIndex) {
    if (sourceIndex === undefined) {
      return;
    }
    const glyphController = await this.sceneModel.getSelectedVariableGlyphController();
    const glyph = glyphController.glyph;
    const source = glyph.sources[sourceIndex];
    const dialog = await dialogSetup("Delete source", null, [
      { title: "Cancel", isCancelButton: true },
      { title: "Delete", isDefaultButton: true, result: "ok" },
    ]);

    const canDeleteLayer =
      1 ===
      glyph.sources.reduce(
        (count, src) => count + (src.layerName === source.layerName ? 1 : 0),
        0
      );
    const deleteLayerCheckBox = html.input({
      type: "checkbox",
      id: "delete-layer",
      checked: canDeleteLayer,
      disabled: !canDeleteLayer,
    });

    const dialogContent = html.div({}, [
      html.div({ class: "message" }, [
        `Are you sure you want to delete source #${sourceIndex}, “${source.name}”?`,
      ]),
      html.br(),
      deleteLayerCheckBox,
      html.label({ for: "delete-layer", style: canDeleteLayer ? "" : "color: gray;" }, [
        `Also delete associated layer “${source.layerName}”`,
      ]),
    ]);
    dialog.setContent(dialogContent);

    if (!(await dialog.run())) {
      return;
    }

    const layer = glyph.layers[source.layerName];
    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      glyph.sources.splice(sourceIndex, 1);
      let layerMessage = "";
      if (layer !== undefined && deleteLayerCheckBox.checked) {
        delete glyph.layers[source.layerName];
        layerMessage = " and layer";
      }
      return "delete source" + layerMessage;
    });
  }

  async addSource() {
    const glyphController = await this.sceneModel.getSelectedVariableGlyphController();
    const glyph = glyphController.glyph;

    const location = glyphController.mapLocationGlobalToLocal(
      this.sceneSettings.location
    );

    const {
      location: newLocation,
      sourceName,
      layerName,
      layerNames,
    } = await this._sourcePropertiesRunDialog(
      "Add source",
      "Add",
      glyph,
      "",
      "",
      location
    );
    if (!newLocation) {
      return;
    }

    const getGlyphFunc = this.sceneController.sceneModel.fontController.getGlyph.bind(
      this.sceneController.sceneModel.fontController
    );

    const instance = (
      await glyphController.instantiate(
        normalizeLocation(newLocation, glyphController.combinedAxes),
        getGlyphFunc
      )
    ).copy();
    // Round coordinates and component positions
    instance.path = instance.path.roundCoordinates();
    roundComponentOrigins(instance.components);

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      glyph.sources.push(
        Source.fromObject({
          name: sourceName,
          layerName: layerName,
          location: newLocation,
        })
      );
      if (layerNames.indexOf(layerName) < 0) {
        // Only add layer if the name is new
        glyph.layers[layerName] = Layer.fromObject({ glyph: instance });
      }
      return "add source";
    });
    // Navigate to new source
    const selectedSourceIndex = glyph.sources.length - 1; /* the newly added source */
    this.sceneSettings.selectedSourceIndex = selectedSourceIndex;
  }

  async editSourceProperties(sourceIndex) {
    const glyphController = await this.sceneModel.getSelectedVariableGlyphController();
    const glyph = glyphController.glyph;

    const source = glyph.sources[sourceIndex];

    const {
      location: newLocation,
      sourceName,
      layerName,
      layerNames,
    } = await this._sourcePropertiesRunDialog(
      "Source properties",
      "Done",
      glyph,
      source.name,
      source.layerName,
      source.location
    );
    if (!newLocation) {
      return;
    }

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const source = glyph.sources[sourceIndex];
      if (!objectsEqual(source.location, newLocation)) {
        source.location = newLocation;
      }
      if (sourceName !== source.name) {
        source.name = sourceName;
      }
      const oldLayerName = source.layerName;
      if (layerName !== oldLayerName) {
        source.layerName = layerName;
        if (layerNames.indexOf(layerName) < 0) {
          // Rename the layer
          if (glyph.layers[oldLayerName]) {
            glyph.layers[layerName] = glyph.layers[oldLayerName];
            delete glyph.layers[oldLayerName];
          }
          for (const source of glyph.sources) {
            if (source.layerName === oldLayerName) {
              source.layerName = layerName;
            }
          }
        }
      }
      return "edit source properties";
    });
  }

  async _sourcePropertiesRunDialog(
    title,
    okButtonTitle,
    glyph,
    sourceName,
    layerName,
    location
  ) {
    const validateInput = () => {
      const warnings = [];
      const editedSourceName =
        nameController.model.sourceName || nameController.model.suggestedSourceName;
      if (!editedSourceName.length) {
        warnings.push("⚠️ The source name must not be empty");
      } else if (
        editedSourceName !== sourceName &&
        glyph.sources.some((source) => source.name === editedSourceName)
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

    const locationAxes = this._sourcePropertiesLocationAxes(glyph);
    const locationController = new ObservableController({ ...location });
    const layerNames = Object.keys(glyph.layers);
    const suggestedSourceName = suggestedSourceNameFromLocation(
      makeSparseLocation(location, locationAxes)
    );

    const nameController = new ObservableController({
      sourceName: sourceName || suggestedSourceName,
      layerName: layerName === sourceName ? "" : layerName,
      suggestedSourceName: suggestedSourceName,
      suggestedLayerName: sourceName || suggestedSourceName,
    });

    nameController.addKeyListener("sourceName", (event) => {
      nameController.model.suggestedLayerName =
        event.newValue || nameController.model.suggestedSourceName;
      validateInput();
    });

    locationController.addListener((event) => {
      const suggestedSourceName = suggestedSourceNameFromLocation(
        makeSparseLocation(locationController.model, locationAxes)
      );
      if (nameController.model.sourceName == nameController.model.suggestedSourceName) {
        nameController.model.sourceName = suggestedSourceName;
      }
      if (nameController.model.layerName == nameController.model.suggestedSourceName) {
        nameController.model.layerName = suggestedSourceName;
      }
      nameController.model.suggestedSourceName = suggestedSourceName;
      nameController.model.suggestedLayerName =
        nameController.model.sourceName || suggestedSourceName;
      validateInput();
    });

    const sourceLocations = new Set(
      glyph.sources.map((source) =>
        locationToString(makeSparseLocation(source.location, locationAxes))
      )
    );
    if (sourceName.length) {
      sourceLocations.delete(
        locationToString(makeSparseLocation(location, locationAxes))
      );
    }

    const { contentElement, warningElement } = this._sourcePropertiesContentElement(
      locationAxes,
      nameController,
      locationController,
      layerNames,
      sourceLocations
    );

    const dialog = await dialogSetup(title, null, [
      { title: "Cancel", isCancelButton: true },
      { title: okButtonTitle, isDefaultButton: true, disabled: !sourceName.length },
    ]);
    dialog.setContent(contentElement);

    setTimeout(() => contentElement.querySelector(`#sourceName`)?.focus(), 0);

    validateInput();

    if (!(await dialog.run())) {
      // User cancelled
      return {};
    }

    const newLocation = makeSparseLocation(locationController.model, locationAxes);

    sourceName =
      nameController.model.sourceName || nameController.model.suggestedSourceName;
    layerName =
      nameController.model.layerName || nameController.model.suggestedLayerName;

    return { location: newLocation, sourceName, layerName, layerNames };
  }

  _sourcePropertiesLocationAxes(glyph) {
    const localAxisNames = glyph.axes.map((axis) => axis.name);
    const globalAxes = mapAxesFromUserSpaceToDesignspace(
      // Don't include global axes that also exist as local axes
      this.globalAxes.filter((axis) => !localAxisNames.includes(axis.name))
    );
    return [
      ...globalAxes,
      ...(globalAxes.length && glyph.axes.length ? [{ isDivider: true }] : []),
      ...glyph.axes,
    ];
  }

  _sourcePropertiesContentElement(
    locationAxes,
    nameController,
    locationController,
    layerNames,
    sourceLocations
  ) {
    const locationElement = html.createDomElement("designspace-location", {
      style: `grid-column: 1 / -1;
        min-height: 0;
        overflow: auto;
        height: 100%;
      `,
    });
    const warningElement = html.div({
      id: "warning-text",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });
    locationElement.axes = locationAxes;
    locationElement.controller = locationController;
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
      [
        ...labeledTextInput("Source name:", nameController, "sourceName", {
          placeholderKey: "suggestedSourceName",
        }),
        ...labeledTextInput("Layer:", nameController, "layerName", {
          placeholderKey: "suggestedLayerName",
          choices: layerNames,
        }),
        html.br(),
        locationElement,
        warningElement,
      ]
    );
    return { contentElement, warningElement };
  }

  _updateEditLocalAxesButtonState() {
    const button = this.contentElement.querySelector("#edit-local-axes-button");
    button.disabled = !this.sceneModel.selectedGlyph;
  }

  async editLocalAxes(event) {
    const varGlyphController =
      await this.sceneModel.getSelectedVariableGlyphController();
    if (!varGlyphController) {
      return;
    }
    const dialog = await dialogSetup("Edit local axes", null, [
      { title: "Cancel", isCancelButton: true },
      { title: "Okay", isDefaultButton: true, result: "ok" },
    ]);

    const columnDescriptions = [
      { key: "name", title: "Name", width: "8em", editable: true },
      {
        key: "minValue",
        title: "Minimum",
        width: "5em",
        align: "right",
        editable: true,
        formatter: NumberFormatter,
      },
      {
        key: "defaultValue",
        title: "Default",
        width: "5em",
        align: "right",
        editable: true,
        formatter: NumberFormatter,
      },
      {
        key: "maxValue",
        title: "Maximum",
        width: "5em",
        align: "right",
        editable: true,
        formatter: NumberFormatter,
      },
    ];

    const axisList = html.createDomElement("ui-list");
    axisList.columnDescriptions = columnDescriptions;
    axisList.showHeader = true;
    axisList.minHeight = "6em";
    const axisItems = varGlyphController.axes.map((axis) => {
      return { ...axis };
    });
    axisList.setItems(axisItems);

    const addRemoveAxisButtons = html.createDomElement("add-remove-buttons", {
      id: "axis-list-add-remove-buttons",
    });
    addRemoveAxisButtons.disableRemoveButton = true;

    addRemoveAxisButtons.addButtonCallback = (event) => {
      const index = axisItems.length;
      axisItems.push({
        name: "UntitledAxis",
        minValue: 0,
        defaultValue: 0,
        maxValue: 100,
      });
      axisList.setItems(axisItems);
      axisList.editCell(index, "name");
    };

    addRemoveAxisButtons.removeButtonCallback = (event) => {
      const index = axisList.getSelectedItemIndex();
      if (index !== undefined) {
        axisItems.splice(index, 1);
        axisList.setItems(axisItems);
      }
    };

    axisList.addEventListener("listSelectionChanged", (event) => {
      addRemoveAxisButtons.disableRemoveButton =
        axisList.getSelectedItemIndex() === undefined;
    });

    const contentElement = html.div({}, [axisList, addRemoveAxisButtons]);

    dialog.setContent(contentElement);
    if (!(await dialog.run())) {
      return;
    }

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      // This doesn't work yet:
      // glyph.axes = axisItems;
      // Work around like this:
      glyph.axes.splice(0, glyph.axes.length, ...axisItems);
      return "edit axes";
    });
  }
}

function mapAxesFromUserSpaceToDesignspace(axes) {
  return axes.map((axis) => {
    const newAxis = { ...axis };
    if (axis.mapping) {
      for (const prop of ["minValue", "defaultValue", "maxValue"]) {
        newAxis[prop] = piecewiseLinearMap(
          axis[prop],
          Object.fromEntries(axis.mapping)
        );
      }
    }
    return newAxis;
  });
}

function* labeledTextInput(label, controller, key, options) {
  yield html.label({ for: key, style: "text-align: right;" }, [label]);

  const choices = options?.choices;
  const choicesID = `${key}-choices`;

  const inputElement = htmlToElement(`<input ${choices ? `list="${choicesID}"` : ""}>`);
  inputElement.type = "text";
  inputElement.id = key;
  inputElement.value = controller.model[key];
  inputElement.oninput = () => (controller.model[key] = inputElement.value);

  controller.addKeyListener(key, (event) => {
    inputElement.value = event.newValue;
  });

  if (options && options.placeholderKey) {
    inputElement.placeholder = controller.model[options.placeholderKey];
    controller.addKeyListener(
      options.placeholderKey,
      (event) => (inputElement.placeholder = event.newValue)
    );
  }

  yield inputElement;

  if (choices) {
    yield html.createDomElement(
      "datalist",
      { id: choicesID },
      choices.map((item) => html.createDomElement("option", { value: item }))
    );
  }
}

function roundComponentOrigins(components) {
  components.forEach((component) => {
    component.transformation.translateX = Math.round(
      component.transformation.translateX
    );
    component.transformation.translateY = Math.round(
      component.transformation.translateY
    );
  });
}

function makeSparseLocation(location, axes) {
  return Object.fromEntries(
    axes
      .filter(
        (axis) =>
          location[axis.name] !== undefined && location[axis.name] !== axis.defaultValue
      )
      .map((axis) => [axis.name, location[axis.name]])
  );
}

function getAxisInfoFromGlyph(glyph) {
  const axisInfo = {};
  for (const axis of glyph?.axes || []) {
    const baseName = getAxisBaseName(axis.name);
    if (axisInfo[baseName]) {
      continue;
    }
    axisInfo[baseName] = { ...axis, name: baseName };
  }
  return Object.values(axisInfo);
}

function suggestedSourceNameFromLocation(location) {
  return (
    Object.entries(location)
      .map(([name, value]) => {
        value = round(value, 1);
        return `${name}=${value}`;
      })
      .join(",") || "default"
  );
}

function makeIconCellFactory(iconPaths, triggerOnDoubleClick = false) {
  return (item, colDesc) => {
    const value = item[colDesc.key];
    const clickSymbol = triggerOnDoubleClick ? "ondblclick" : "onclick";
    const iconElement = html.createDomElement("inline-svg", {
      src: iconPaths[boolInt(value)],
      style: "width: 1.2em; height: 1.2em;",
      ondblclick: (event) => {
        event.stopImmediatePropagation();
      },
      [clickSymbol]: (event) => {
        const newValue = !item[colDesc.key];
        item[colDesc.key] = newValue;
        iconElement.src = iconPaths[boolInt(newValue)];
        event.stopImmediatePropagation();
      },
    });
    return iconElement;
  };
}

function interpolationErrorCell(item, colDesc) {
  return item[colDesc.key]
    ? html.createDomElement("inline-svg", {
        src: "/tabler-icons/bug.svg",
        style: "width: 1.2em; height: 1.2em; color: #F36;",
        onclick: (event) => {
          event.stopImmediatePropagation();
          dialog("The source has an interpolation incompatibility", item[colDesc.key], [
            { title: "Okay" },
          ]);
        },
      })
    : "";
}

const interpolationContributionIconSources = [...range(1, 6)].map(
  (index) => `/tabler-icons/antenna-bars-${index}.svg`
);

function interpolationContributionCell(item, colDesc) {
  const iconElement = html.createDomElement("inline-svg", {
    src: "",
    style: "width: 1.2em; height: 1.2em;",
  });

  function updateFromItem() {
    const rawValue = item[colDesc.key];
    if (rawValue != null) {
      let index;
      index = Math.min(Math.round(Math.sqrt(Math.abs(rawValue)) * 4), 4);
      if (index === 0 && Math.abs(rawValue) > 0.00001) {
        // Ensure non-zero has one "bar"
        index = 1;
      }
      iconElement.src = interpolationContributionIconSources[index];
      iconElement.style.color = rawValue < 0 ? "#F36" : null;
    } else {
      iconElement.src = "";
    }
  }

  const controller = item[controllerKey];
  controller.addKeyListener(colDesc.key, (event) => {
    updateFromItem();
  });

  updateFromItem();

  return iconElement;
}

function checkboxListCell(item, colDesc) {
  const value = item[colDesc.key];
  return html.input({
    type: "checkbox",
    style: `width: auto; margin: 0; padding: 0; outline: none;`,
    checked: value,
    onclick: (event) => {
      item[colDesc.key] = event.target.checked;
      event.stopImmediatePropagation();
    },
    ondblclick: (event) => {
      event.stopImmediatePropagation();
    },
  });
}

function statusListCell(item, colDesc) {
  const value = item[colDesc.key];
  let color;
  for (const statusDef of colDesc.statusFieldDefinitions) {
    if (value === statusDef.value) {
      color = statusDef.color;
    }
  }
  const onclick = (event) => {
    const cell = event.target;
    const cellRect = cell.getBoundingClientRect();
    const menuItems = colDesc.menuItems.map((menuItem) => {
      return {
        ...menuItem,
        checked: menuItem.statusDef.value === item[colDesc.key],
        callback: () => {
          item[colDesc.key] = menuItem.statusDef.value;
          cell.style = cellColorStyle(menuItem.statusDef.color);
        },
      };
    });
    showMenu(menuItems, { x: cellRect.left, y: cellRect.bottom });
  };
  const props = {
    class: "status-cell",
    onclick: onclick,
  };
  if (color) {
    props["style"] = cellColorStyle(color);
    return html.div(props);
  } else {
    return html.div(props, [value]);
  }
}

function cellColorStyle(color) {
  return `background-color: ${rgbaToCSS(color)}; width: 100%;`;
}

customElements.define("panel-designspace-navigation", DesignspaceNavigationPanel);
