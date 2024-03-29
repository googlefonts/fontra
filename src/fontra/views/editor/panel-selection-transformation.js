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

    .radio-btns{
      display: flex;
      gap: 0rem;
    }

    .icon-origin-node:hover {
      color: red;
        stroke-width: 5.5px;
    }

    .icon-origin-node:active {
        color: #585858;
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
    if (
      senderInfo?.senderID === this &&
      senderInfo?.fieldKeyPath?.length !== 3 &&
      senderInfo?.fieldKeyPath?.[0] !== "component" &&
      senderInfo?.fieldKeyPath?.[2] !== "name"
    ) {
      // Don't rebuild, just update the Dimensions field
      return;
    }
    if (!this.infoForm.contentElement.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }

    await this.fontController.ensureInitialized;

    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName,
      this.sceneController.sceneSettings.editLayerName
    );

    const formContents = [];

    formContents.push({ type: "header", label: `Transformations` });

    /*     let radio_button_origin = html.createDomElement("div", {
      class: "radio-btns-wrapper",
       "data-tooltip": "Origin",
      "data-tooltipposition": "bottom",
    });

    for (const key1 in ["top", "middle", "bottom"]) {
      let radio_row = html.createDomElement("div", {
        class: "radio-btns",
      });
      for (const key2 in ["left", "center", "right"]) {
        const key = `${key1}-${key2}`;
        let radio_button = html.createDomElement("input", {
          type: "radio",
          value: key,
          name: key,
          "v-model": "role",
          onclick: (event) => this._doSomthing(key),
        });
        radio_row.appendChild(radio_button);
      }
      radio_button_origin.appendChild(radio_row);
    }

    formContents.push({
      type: "single-icon",
      element: radio_button_origin,
    }); */

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

    let label_button = html.createDomElement("div", {
      src: "/tabler-icons/flip-horizontal.svg",
      ondblclick: (event) => this._doubleClickOrigin(),
      class: "",
    });
    label_button.textContent = "Origin:";

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationOrigin"]',
      label: label_button,
      fieldX: {
        key: '["selectionTransformationOriginX"]',
        name: "selectionTransformationOriginX",
        value: undefined,
        disabled: true,
        defaultValue: undefined,
      },
      fieldY: {
        key: '["selectionTransformationOriginY"]',
        name: "selectionTransformationOriginY",
        value: undefined,
        disabled: true,
        defaultValue: undefined,
      },
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
        value: this.moveX,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.moveX = value;
          return value;
        },
      },
      fieldY: {
        key: '["selectionTransformationMoveY"]',
        value: this.moveY,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.moveY = value;
          return value;
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
      value: this.rotation,
      getValue: (layerGlyph, layerGlyphController, fieldItem) => {
        return fieldItem.value;
      },
      setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
        this.rotation = value;
        return value;
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
        id: "selection-transformation-scaleX",
        value: this.scaleX,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.scaleX = value;
          this.scaleFactorX = value / 100;
          return value;
        },
      },
      fieldY: {
        key: '["selectionTransformationScaleY"]',
        id: "selection-transformation-scaleY",
        value: this.scaleY,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.scaleY = value;
          this.scaleFactorY = value / 100;
          return value;
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

    this._formFieldsByKey = {};
    for (const field of formContents) {
      if (field.fieldX) {
        this._formFieldsByKey[field.fieldX.key] = field.fieldX;
        this._formFieldsByKey[field.fieldY.key] = field.fieldY;
      } else {
        this._formFieldsByKey[field.key] = field;
      }
    }

    this.infoForm.setFieldDescriptions(formContents);
    if (glyphController) {
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  _doubleClickOrigin() {
    console.log("double click origin");
    const el = this.infoForm.querySelector(
      'input[name="selectionTransformationOriginX"]'
    ); //.value = 0;
    console.log(el);
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

function changeOrigin(thisElement) {
  //console.log(thisElement)
  const els = document.querySelectorAll(".node");
  for (subElement of els) {
    console.log(subElement);
    //subElement.setAttribute('fill', 'red')
    if (subElement.id === thisElement.id) {
      subElement.style.color = "red";
    } else {
      subElement.style.color = "unset";
    }
  }
  //console.log(thisElement)
  //console.log(thisElement.id)
}

customElements.define("panel-selection-transformation", SelectionTransformationPanel);
