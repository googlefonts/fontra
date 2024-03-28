import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { scalePoint } from "/core/path-functions.js";
import {
  enumerate,
  findNestedActiveElement,
  getCharFromCodePoint,
  makeUPlusStringFromCodePoint,
  parseSelection,
  range,
  round,
  splitGlyphNameExtension,
  throttleCalls,
} from "/core/utils.js";
import { Form } from "/web-components/ui-form.js";

export default class SelectionTransformationPanelSave extends Panel {
  identifier = "selection-transformation";
  iconPath = "/tabler-icons/shape.svg";

  static styles = `
    .selection-transformation {
      display: flex;
      flex-direction: column;
      gap: 1em;
      justify-content: space-between;
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      padding: 1em;
      white-space: normal;
    }

    ui-form {
      overflow-x: hidden;
      overflow-y: auto;
    }

    .sidebar-text-entry {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      padding: 1em;
    }

    #text-entry-textarea {
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      border-radius: 0.25em;
      border: 0.5px solid lightgray;
      outline: none;
      padding: 0.2em 0.5em;
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1.1rem;
      resize: none;
      overflow-x: auto;
    }
  `;

  constructor(editorController) {
    super(editorController);

    this.scaleFactorX = 1;
    this.scaleFactorY = 1;

    this.infoForm = new Form();
    this.contentElement.appendChild(this.infoForm);

    console.log("this.infoForm", this.infoForm);
    const testtestscaleX = this.contentElement.querySelector(
      "#selection-transformation-scaleX"
    );
    console.log("testtestscaleX", testtestscaleX);

    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);

    //this.textSettingsController = this.editorController.sceneSettingsController;
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "selection", "location"],
      (event) => this.throttledUpdate()
    );

    this.sceneController.sceneSettingsController.addKeyListener(
      "positionedLines",
      (event) => {
        if (!this.haveInstance) {
          this.update(event.senderInfo?.senderID);
        }
      }
    );

    this.sceneController.addCurrentGlyphChangeListener((event) => {
      this.throttledUpdate(event.senderID);
    });

    this.sceneController.addEventListener("glyphEditCannotEditReadOnly", async () => {
      this.update();
    });

    this.sceneController.addEventListener("glyphEditLocationNotAtSource", async () => {
      this.update();
    });
  }

  getContentElement() {
    return html.div(
      {
        class: "selection-transformation-save",
      },
      []
    );
  }

  async update(senderInfo) {
    await this.fontController.ensureInitialized;

    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName,
      this.sceneController.sceneSettings.editLayerName
    );

    const formContents = [];

    formContents.push({ type: "header", label: `Transformations` });

    let icon_origin = html.createDomElement("icon-button", {
      src: "/tabler-icons/grid-dots.svg",
      onclick: (event) => this._doSomthing("Get Origin"),
      class: "",
    });
    formContents.push({
      type: "single-icon",
      element: icon_origin,
    });

    formContents.push({ type: "divider" });

    formContents.push({
      type: "icons",
      label: "Flip",
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          src: "/tabler-icons/flip-vertical.svg",
          onclick: (event) => this._doSomthing("Flip vertically"),
          /*           "data-tooltip": "Flip vertically",
          "data-tooltipposition": "left", */
        }),
        html.createDomElement("icon-button", {
          src: "/tabler-icons/flip-horizontal.svg",
          onclick: (event) => this._doSomthing("Flip horizontally"),
          /*           "data-tooltip": "Flip horizontally",
          "data-tooltipposition": "left", */
        }),
      ],
    });

    let button_scale = html.createDomElement("icon-button", {
      src: "/tabler-icons/dimensions.svg",
      onclick: (event) => this._scaleLayerGlyph(),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Scale",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      label: button_scale,
      fieldX: {
        id: "selection-transformation-scaleX",
        key: "selectionTransformationScaleX",
        value: 100,
        onchange: (event) => console.log("this.scaleFactorX", this.scaleFactorX),
      },
      fieldY: {
        id: "selection-transformation-scaleY",
        key: "selection-transformation-scaleY",
        value: 100,
        onchange: (event) => (this.scaleFactorY = event.target.value / 100),
      },
    });

    formContents.push({
      type: "edit-number-x-y",
      label: "button_scale",
      fieldX: {
        id: "inputScaleX",
        value: 100,
      },
      fieldY: {
        id: "inputScaleY",
        value: 100,
      },
    });

    let button_rotate = html.createDomElement("icon-button", {
      src: "/tabler-icons/rotate-clockwise.svg",
      onclick: (event) => this._doSomthing("Rotate Selection"),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Rotate",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number",
      label: button_rotate,
      value: 0,
    });

    let button_move = html.createDomElement("icon-button", {
      src: "/tabler-icons/arrow-move-right.svg",
      onclick: (event) => this._doSomthing("Move Selection"),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Scale",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      label: button_move,
      fieldX: { value: 0 },
      fieldY: { value: 0 },
    });

    if (!formContents.length) {
      this.infoForm.setFieldDescriptions([{ type: "text", value: "(No selection)" }]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
    }
  }

  _getSelection() {
    const { point, component, componentOrigin, componentTCenter } = parseSelection(
      this.sceneController.selection
    );

    const componentIndices = [
      ...new Set([
        ...(component || []),
        ...(componentOrigin || []),
        ...(componentTCenter || []),
      ]),
    ].sort((a, b) => a - b);
    return { pointIndices: point || [], componentIndices };
  }

  async _scaleLayerGlyph() {
    const { pointIndices, componentIndices } = this._getSelection();
    if (!pointIndices.length >= 2) {
      return;
    }
    console.log("document", document);

    const testEl = document.querySelector("#menu-panel-container");
    console.log("testEl", testEl);

    const testEl2 = document.querySelector("#behavior-checkbox");
    console.log("testEl2", testEl2);
    console.log("this.contentElement", this.contentElement);
    console.log("this", this);

    const scaleXElement = this.querySelector("#selection-transformation-scaleX");
    console.log("scaleXElement", scaleXElement);

    const scaleYElement = this.contentElement.querySelector(
      "#selection-transformation-scaleY"
    );
    console.log("scaleYElement", scaleYElement);

    const scaleYElementAlt = document.querySelector("#selection-transformation-scaleY");
    console.log("scaleYElementAlt", scaleYElementAlt);

    const scaleYElementAltAlt = document.getElementById(
      "selection-transformation-scaleY"
    );
    console.log("scaleYElementAltAlt", scaleYElementAltAlt);

    const inputScaleX = document.getElementById("edit-tools-multi-wrapper-shape-tool");
    console.log("inputScaleX", inputScaleX);

    /*     let scaleFactorX = this.scaleFactorX;
    let scaleFactorY = this.scaleFactorY;

    console.log("scaleFactorX", scaleFactorX);
    console.log("scaleFactorY", scaleFactorY);
 */
    console.log("pointIndices", pointIndices);
    return;
    console.log("scaleLayerGlyph", pointIndices, scaleFactorX, scaleFactorY);
    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        const map_x = pointIndices.map((i) => layerGlyph.path.getPoint(i).x);
        const xMin = Math.min(...map_x);
        const xMax = Math.max(...map_x);
        const width = xMax - xMin;
        console.log("xMin", xMin);
        console.log("xMax", xMax);
        console.log("width", width);

        let scaleOriginX = xMin; // if scale from left
        //scaleOriginX = xMin + width / 2; // if scale from center
        //scaleOriginX = xMax; // if scale from right
        let pinPoint = { x: scaleOriginX, y: 0 };

        for (const [i, index] of enumerate(
          range(0, layerGlyph.path.coordinates.length, 2)
        )) {
          if (pointIndices.includes(i)) {
            let point = layerGlyph.path.getPoint(i);
            let pointScaled = scalePoint(pinPoint, point, scaleFactorX);
            layerGlyph.path.coordinates[index] = pointScaled.x;
          }
        }

        const map_y = pointIndices.map((i) => layerGlyph.path.getPoint(i).y);
        const yMin = Math.min(...map_y);
        const yMax = Math.max(...map_y);
        const height = yMax - yMin;

        let scaleOriginY = yMin; // if scale from left
        //scaleOriginY = yMin + height / 2; // if scale from center
        //scaleOriginY = yMax; // if scale from right
        pinPoint = { x: 0, y: scaleOriginY };

        for (const [i, index] of enumerate(
          range(1, layerGlyph.path.coordinates.length, 2)
        )) {
          if (pointIndices.includes(i)) {
            let point = layerGlyph.path.getPoint(i);
            let pointScaled = scalePoint(pinPoint, point, scaleFactorY);
            layerGlyph.path.coordinates[index] = pointScaled.y;
          }
        }
      }
      return "scale";
    });
  }

  _getOriginInfo(event) {
    //const el = html.getElementById(ID);
    console.log("event", event);
    console.log("this", this);
  }

  _doSomthing(text) {
    console.log("do something: ", text);
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define(
  "panel-selection-transformation-save",
  SelectionTransformationPanelSave
);
