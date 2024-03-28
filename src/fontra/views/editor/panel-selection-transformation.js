import SelectionInfoPanel from "./panel-selection-info.js";
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

export default class SelectionTransformationPanel extends SelectionInfoPanel {
  identifier = "selection-transformation";
  iconPath = "/tabler-icons/shape.svg";

  scaleX = 100;
  scaleY = 100;
  scaleFactorX = 1;
  scaleFactorY = 1;
  rotation = 0;
  moveX = 0;
  moveY = 0;

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

  `;

  getContentElement() {
    return html.div(
      {
        class: "selection-transformation",
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

    let button_move = html.createDomElement("icon-button", {
      src: "/tabler-icons/arrow-move-right.svg",
      onclick: (event) => this._moveLayerGlyph(),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Scale",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationMove"]',
      label: button_move,
      fieldX: {
        key: '["selectionTransformationMoveX"]',
        value: 0,
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          console.log("setValue", value);
          this.moveX = value;
        },
      },
      fieldY: {
        key: '["selectionTransformationMoveY"]',
        value: 0,
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          console.log("setValue", value);
          this.moveY = value;
        },
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
      key: '["selectionTransformationRotate"]',
      label: button_rotate,
      value: 0,
      setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
        console.log("setValue rotation", value);
        this.rotation = value;
      },
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
      key: '["selectionTransformationScale"]',
      label: button_scale,
      fieldX: {
        key: '["selectionTransformationScaleX"]',
        //id: "selection-transformation-scaleX",
        value: 100,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return this.scaleFactorX;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          console.log("setValue", value);
          this.scaleFactorX = value / 100;
          console.log("scaleFactorX", this.scaleFactorX);
        },
      },
      fieldY: {
        key: '["selectionTransformationScaleY"]',
        //id: "selection-transformation-scaleY",
        value: 100,
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          console.log("setValue", value);
          this.scaleFactorY = value / 100;
          console.log("scaleFactorY", this.scaleFactorY);
        },
      },
    });

    formContents.push({ type: "divider" });

    formContents.push({
      type: "icons",
      label: "Flip",
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          src: "/tabler-icons/flip-vertical.svg",
          onclick: (event) =>
            this._scaleLayerGlyph({
              scaleFactorX: -1,
              scaleFactorY: 1,
              undoName: "Flip vertically",
            }),
          /*           "data-tooltip": "Flip vertically",
          "data-tooltipposition": "left", */
        }),
        html.createDomElement("icon-button", {
          src: "/tabler-icons/flip-horizontal.svg",
          onclick: (event) =>
            this._scaleLayerGlyph({
              scaleFactorX: 1,
              scaleFactorY: -1,
              undoName: "Flip horizontally",
            }),
          /*           "data-tooltip": "Flip horizontally",
          "data-tooltipposition": "left", */
        }),
      ],
    });

    this.infoForm.setFieldDescriptions(formContents);
    if (glyphController) {
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  async _moveLayerGlyph({
    moveX = this.moveX,
    moveY = this.moveY,
    undoName = "move",
  } = {}) {
    const { pointIndices, componentIndices } = this._getSelection();
    if (!pointIndices.length >= 1) {
      return;
    }

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        for (const [i, index] of enumerate(
          range(0, layerGlyph.path.coordinates.length, 2)
        )) {
          if (pointIndices.includes(i)) {
            let point = layerGlyph.path.getPoint(i);
            layerGlyph.path.coordinates[index] = point.x + moveX;
          }
        }

        for (const [i, index] of enumerate(
          range(1, layerGlyph.path.coordinates.length, 2)
        )) {
          if (pointIndices.includes(i)) {
            let point = layerGlyph.path.getPoint(i);
            layerGlyph.path.coordinates[index] = point.y + moveY;
          }
        }
      }
      return undoName;
    });
  }

  async _scaleLayerGlyph({
    originPositionX = "center",
    originPositionY = "center",
    scaleFactorX = this.scaleFactorX,
    scaleFactorY = this.scaleFactorY,
    undoName = "scale",
  } = {}) {
    console.log("scaleLayerGlyph", scaleFactorX, scaleFactorY);
    const { pointIndices, componentIndices } = this._getSelection();
    if (!pointIndices.length >= 2) {
      return;
    }

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
        if (originPositionX === "center") {
          scaleOriginX = xMin + width / 2;
        }

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
        if (originPositionY === "center") {
          scaleOriginY = yMin + height / 2;
        }
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
      return undoName;
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

customElements.define("panel-selection-transformation", SelectionTransformationPanel);
