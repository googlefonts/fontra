import { decomposeAffineTransform } from "../core/glyph-controller.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import SelectionInfoPanel from "./panel-selection-info.js";
import * as html from "/core/html-utils.js";
import { rectFromPoints, unionRect } from "/core/rectangle.js";
import { Transform } from "/core/transform.js";
import { enumerate, makeAffineTransform } from "/core/utils.js";

export default class SelectionTransformationPanel extends SelectionInfoPanel {
  identifier = "selection-transformation";
  iconPath = "/tabler-icons/shape.svg";

  scaleX = 100;
  scaleY = undefined;
  scaleFactorX = 1;
  scaleFactorY = 1;
  rotation = 0;
  moveX = 0;
  moveY = 0;
  originX = "center";
  originY = "middle";
  originXButton = undefined;
  originYButton = undefined;
  skewX = 0;
  skewY = 0;

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
    if (
      senderInfo?.senderID === this &&
      senderInfo?.fieldKeyPath?.length !== 3 &&
      senderInfo?.fieldKeyPath?.[0] !== "component" &&
      senderInfo?.fieldKeyPath?.[2] !== "name"
    ) {
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

    let radio_button_origin = html.createDomElement("div", {
      class: "origin-radio-buttons ui-form-center",
    });

    for (const keyY of ["top", "middle", "bottom"]) {
      for (const keyX of ["left", "center", "right"]) {
        const key = `${keyX}-${keyY}`;
        let radio_button = html.createDomElement("input", {
          "type": "radio",
          "value": key,
          "name": "origin",
          "v-model": "role",
          "checked": keyX === this.originX && keyY === this.originY ? "checked" : "",
          "onclick": (event) => this._changeOrigin(keyX, keyY),
          "data-tooltip": `Origin ${keyY} ${keyX}`,
          "data-tooltipposition": "bottom",
        });
        radio_button_origin.appendChild(radio_button);
      }
    }

    formContents.push({
      type: "single-icon",
      element: radio_button_origin,
    });

    formContents.push({ type: "divider" });

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationOrigin"]',
      label: "Origin",
      fieldX: {
        key: '["selectionTransformationOriginX"]',
        value: this.originXButton,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.originX = value;
          this.originXButton = value;
          this.update();
          return value;
        },
      },
      fieldY: {
        key: '["selectionTransformationOriginY"]',
        value: this.originYButton,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.originY = value;
          this.originYButton = value;
          this.update();
          return value;
        },
      },
    });

    formContents.push({ type: "divider" });

    let button_move = html.createDomElement("icon-button", {
      src: "/tabler-icons/arrow-move-right.svg",
      onclick: (event) =>
        this._transformLayerGlyph(
          new Transform().translate(this.moveX, this.moveY),
          "move"
        ),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Move",
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

    let button_scale = html.createDomElement("icon-button", {
      src: "/tabler-icons/dimensions.svg",
      onclick: (event) =>
        this._transformLayerGlyph(
          new Transform().scale(
            this.scaleFactorX,
            this.scaleY ? this.scaleFactorY : this.scaleFactorX
          ),
          "scale"
        ),
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

    let button_rotate = html.createDomElement("icon-button", {
      src: "/tabler-icons/rotate.svg",
      onclick: (event) =>
        this._transformLayerGlyph(
          new Transform().rotate((this.rotation * Math.PI) / 180),
          "rotate"
        ),
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

    let button_skew = html.createDomElement("icon-button", {
      src: "/tabler-icons/angle.svg",
      onclick: (event) =>
        this._transformLayerGlyph(
          new Transform().skew(
            (this.skewX * Math.PI) / 180,
            (this.skewY * Math.PI) / 180
          ),
          "slant"
        ),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Slant",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationSkew"]',
      label: button_skew,
      fieldX: {
        key: '["selectionTransformationSkewX"]',
        id: "selection-transformation-skewX",
        value: this.skewX,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.skewX = value;
          return value;
        },
      },
      fieldY: {
        key: '["selectionTransformationSkewY"]',
        id: "selection-transformation-skewY",
        value: this.skewY,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.skewY = value;
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
            this._transformLayerGlyph(new Transform().scale(-1, 1), "flip vertically"),
          /* "data-tooltip": "Flip vertically",
          "data-tooltipposition": "left", */
        }),
        html.createDomElement("icon-button", {
          src: "/tabler-icons/flip-horizontal.svg",
          onclick: (event) =>
            this._transformLayerGlyph(
              new Transform().scale(1, -1),
              "flip horizontally"
            ),
          /* "data-tooltip": "Flip horizontally",
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

  _getSelectedBounds(layerGlyphController, layerGlyph, pointIndices, componentIndices) {
    const selectionRects = [];
    if (pointIndices.length) {
      const selRect = rectFromPoints(
        pointIndices.map((i) => layerGlyph.path.getPoint(i)).filter((point) => !!point)
      );
      if (selRect) {
        selectionRects.push(selRect);
      }
    }

    for (const componentIndex of componentIndices) {
      const component = layerGlyphController.components[componentIndex];
      if (!component || !component.controlBounds) {
        continue;
      }
      selectionRects.push(component.controlBounds);
    }

    if (selectionRects.length) {
      const selectionBounds = unionRect(...selectionRects);
      return selectionBounds;
    }
  }

  _getPinPoint(
    layerGlyphController,
    layerGlyph,
    pointIndices,
    componentIndices,
    originX,
    originY
  ) {
    let bounds = this._getSelectedBounds(
      layerGlyphController,
      layerGlyph,
      pointIndices,
      componentIndices
    );
    if (!bounds) {
      bounds = {
        xMin: 0,
        xMax: layerGlyph.xAdvance,
        yMin: 0,
        yMax: layerGlyph.yAdvance ? layerGlyph.yAdvance : 0,
      };
    }
    const width = bounds.xMax - bounds.xMin;
    const height = bounds.yMax - bounds.yMin;

    // default from center
    let pinPointX = bounds.xMin + width / 2;
    let pinPointY = bounds.yMin + height / 2;

    if (typeof originX === "number") {
      pinPointX = originX;
    } else if (originX === "left") {
      pinPointX = bounds.xMin;
    } else if (originX === "right") {
      pinPointX = bounds.xMax;
    }

    if (typeof originY === "number") {
      pinPointY = originY;
    } else if (originY === "top") {
      pinPointY = bounds.yMax;
    } else if (originY === "bottom") {
      pinPointY = bounds.yMin;
    }

    return { x: pinPointX, y: pinPointY };
  }
  _getPointIndicesInclOffCurves(layerGlyph, pointIndices) {
    if (!pointIndices || pointIndices.length < 1) {
      return [];
    }
    let newPointIndices = new Set();
    const behaviorFactory = new EditBehaviorFactory(
      layerGlyph,
      this.sceneController.selection,
      this.sceneController.experimentalFeatures.scalingEditBehavior
    );

    const editBehavior = behaviorFactory.getBehavior("default");
    const contours = behaviorFactory.contours;
    for (const [i, arrayPointsIndices] of enumerate(
      editBehavior.participatingPointIndices
    )) {
      if (!arrayPointsIndices) {
        continue;
      }
      arrayPointsIndices.forEach((item) =>
        newPointIndices.add(item + contours[i].startIndex)
      );
    }
    return Array.from(newPointIndices).sort((a, b) => a - b);
  }

  async _transformLayerGlyph(transformation, undoLabel) {
    let { pointIndices, componentIndices } = this._getSelection();
    if ((!pointIndices || pointIndices.length < 1) && !componentIndices.length) {
      return;
    }

    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();

    const editingLayers = this.sceneController.getEditingLayerFromGlyphLayers(
      varGlyphController.layers
    );
    const staticGlyphControllers = {};
    for (const [i, source] of enumerate(varGlyphController.sources)) {
      if (source.layerName in editingLayers) {
        staticGlyphControllers[source.layerName] =
          await this.fontController.getLayerGlyphController(
            varGlyphController.name,
            source.layerName,
            i
          );
      }
    }

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        const pinPoint = this._getPinPoint(
          staticGlyphControllers[layerName],
          layerGlyph,
          pointIndices,
          componentIndices,
          this.originX,
          this.originY
        );
        pointIndices = this._getPointIndicesInclOffCurves(layerGlyph, pointIndices);

        let t = new Transform();
        t = t.translate(pinPoint.x, pinPoint.y);
        t = t.transform(transformation);
        t = t.translate(-pinPoint.x, -pinPoint.y);

        // transform contour points
        for (const index of pointIndices) {
          let point = layerGlyph.path.getPoint(index);
          let pointTransformed = t.transformPointObject(point);
          layerGlyph.path.coordinates[index * 2] = pointTransformed.x;
          layerGlyph.path.coordinates[index * 2 + 1] = pointTransformed.y;
        }

        // transform components
        for (const index of componentIndices) {
          const compo = layerGlyph.components[index];
          const compoT = makeAffineTransform(compo.transformation);
          const newCompoT = t.transform(compoT);
          compo.transformation = decomposeAffineTransform(newCompoT);
        }
      }
      return undoLabel;
    });
  }

  _changeOrigin(keyX, keyY) {
    this.originX = keyX;
    this.originY = keyY;
    this.originXButton = undefined;
    this.originYButton = undefined;
    this.update();
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define("panel-selection-transformation", SelectionTransformationPanel);
