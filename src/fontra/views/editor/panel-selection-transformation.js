import {
  ChangeCollector,
  applyChange,
  consolidateChanges,
  hasChange,
} from "../core/changes.js";
import { decomposeAffineTransform } from "../core/glyph-controller.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { rectFromPoints, unionRect } from "/core/rectangle.js";
import { Transform } from "/core/transform.js";
import { enumerate, makeAffineTransform, parseSelection } from "/core/utils.js";
import { Form } from "/web-components/ui-form.js";

export default class SelectionTransformationPanel extends Panel {
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

  `;

  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();
    this.contentElement.appendChild(this.infoForm);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.transformParameters = {
      scaleX: 100,
      scaleY: undefined,
      rotation: 0,
      moveX: 0,
      moveY: 0,
      originX: "center",
      originY: "middle",
      originXButton: undefined,
      originYButton: undefined,
      skewX: 0,
      skewY: 0,
    };
  }

  getContentElement() {
    return html.div(
      {
        class: "selection-transformation",
      },
      []
    );
  }

  async update(senderInfo) {
    if (!this.infoForm.contentElement.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }

    await this.fontController.ensureInitialized;

    const formContents = [];

    formContents.push({ type: "header", label: `Transformations` });

    let radioButtonOrigin = html.createDomElement("div", {
      class: "origin-radio-buttons ui-form-center",
    });

    for (const keyY of ["top", "middle", "bottom"]) {
      for (const keyX of ["left", "center", "right"]) {
        const key = `${keyX}-${keyY}`;
        let radioButton = html.createDomElement("input", {
          "type": "radio",
          "value": key,
          "name": "origin",
          "v-model": "role",
          "class": "ui-form-radio-button",
          "checked":
            keyX === this.transformParameters.originX &&
            keyY === this.transformParameters.originY
              ? "checked"
              : "",
          "onclick": (event) => this._changeOrigin(keyX, keyY),
          "data-tooltip": `Origin ${keyY} ${keyX}`,
          "data-tooltipposition": "bottom",
        });
        radioButtonOrigin.appendChild(radioButton);
      }
    }

    formContents.push({
      type: "single-icon",
      element: radioButtonOrigin,
    });

    formContents.push({ type: "divider" });

    formContents.push({
      type: "edit-number-x-y",
      label: "Origin",
      fieldX: {
        key: "originXButton",
        value: this.transformParameters.originXButton,
      },
      fieldY: {
        key: "originYButton",
        value: this.transformParameters.originYButton,
      },
    });

    formContents.push({ type: "divider" });

    let buttonMove = html.createDomElement("icon-button", {
      src: "/tabler-icons/arrow-move-right.svg",
      onclick: (event) =>
        this._transformLayerGlyph(
          new Transform().translate(
            this.transformParameters.moveX,
            this.transformParameters.moveY
          ),
          "move"
        ),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Move",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      label: buttonMove,
      fieldX: {
        key: "moveX",
        value: this.transformParameters.moveX,
      },
      fieldY: {
        key: "moveY",
        value: this.transformParameters.moveY,
      },
    });

    let buttonScale = html.createDomElement("icon-button", {
      src: "/tabler-icons/dimensions.svg",
      onclick: (event) =>
        this._transformLayerGlyph(
          new Transform().scale(
            this.transformParameters.scaleX / 100,
            (this.transformParameters.scaleY
              ? this.transformParameters.scaleY
              : this.transformParameters.scaleX) / 100
          ),
          "scale"
        ),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Scale",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      label: buttonScale,
      fieldX: {
        key: "scaleX",
        id: "selection-transformation-scaleX",
        value: this.transformParameters.scaleX,
      },
      fieldY: {
        key: "scaleY",
        id: "selection-transformation-scaleY",
        value: this.transformParameters.scaleY,
      },
    });

    let buttonRotate = html.createDomElement("icon-button", {
      src: "/tabler-icons/rotate.svg",
      onclick: (event) =>
        this._transformLayerGlyph(
          new Transform().rotate((this.transformParameters.rotation * Math.PI) / 180),
          "rotate"
        ),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Rotate",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number",
      key: "rotation",
      label: buttonRotate,
      value: this.transformParameters.rotation,
    });

    let buttonSkew = html.createDomElement("icon-button", {
      src: "/tabler-icons/angle.svg",
      onclick: (event) =>
        this._transformLayerGlyph(
          new Transform().skew(
            (this.transformParameters.skewX * Math.PI) / 180,
            (this.transformParameters.skewY * Math.PI) / 180
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
      label: buttonSkew,
      fieldX: {
        key: "skewX",
        id: "selection-transformation-skewX",
        value: this.transformParameters.skewX,
      },
      fieldY: {
        key: "skewY",
        id: "selection-transformation-skewY",
        value: this.transformParameters.skewY,
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

    this.infoForm.setFieldDescriptions(formContents);

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      this.transformParameters[fieldItem.key] = value;
      if (fieldItem.key === "originXButton" || fieldItem.key === "originYButton") {
        this.transformParameters[fieldItem.key.replace("Button", "")] = value;

        const iconRadioButtons = this.infoForm.shadowRoot.querySelectorAll(
          ".ui-form-radio-button"
        );
        iconRadioButtons.forEach((radioButton) => {
          radioButton.checked = false;
        });
      }
    };
  }

  _getSelectedBounds(layerGlyphController, pointIndices, componentIndices) {
    const selectionRects = [];
    if (pointIndices.length) {
      const selRect = rectFromPoints(
        pointIndices
          .map((i) => layerGlyphController.instance.path.getPoint(i))
          .filter((point) => !!point)
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

  _getPinPoint(layerGlyphController, pointIndices, componentIndices, originX, originY) {
    let bounds = this._getSelectedBounds(
      layerGlyphController,
      pointIndices,
      componentIndices
    );
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

  async _transformLayerGlyph(transformation, undoLabel) {
    let {
      point: pointIndices,
      component: componentIndices,
      componentOrigin,
      componentTCenter,
    } = parseSelection(this.sceneController.selection);

    pointIndices = pointIndices || [];
    componentIndices = componentIndices || [];
    if (!pointIndices.length && !componentIndices.length) {
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

    await this.sceneController.editGlyph((sendIncrementalChange, glyph) => {
      const layerInfo = Object.entries(
        this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          this.sceneController.selection,
          this.sceneController.experimentalFeatures.scalingEditBehavior
        );
        return {
          layerName,
          changePath: ["layers", layerName, "glyph"],
          layerGlyphController: staticGlyphControllers[layerName],
          editBehavior: behaviorFactory.getBehavior("default"),
        };
      });

      const editChanges = [];
      const rollbackChanges = [];
      for (const { changePath, editBehavior, layerGlyphController } of layerInfo) {
        const layerGlyph = layerGlyphController.instance;
        const pinPoint = this._getPinPoint(
          layerGlyphController,
          pointIndices,
          componentIndices,
          this.transformParameters.originX,
          this.transformParameters.originY
        );

        let t = new Transform();
        t = t.translate(pinPoint.x, pinPoint.y);
        t = t.transform(transformation);
        t = t.translate(-pinPoint.x, -pinPoint.y);

        if (pointIndices.length) {
          // only do this if there are points selected
          const pointTransformFunction = t.transformPointObject.bind(t);
          const editChange =
            editBehavior.makeChangeForTransformFunc(pointTransformFunction);
          applyChange(layerGlyph, editChange);
          editChanges.push(consolidateChanges(editChange, changePath));
          rollbackChanges.push(
            consolidateChanges(editBehavior.rollbackChange, changePath)
          );
        }

        // // transform components
        // for (const index of componentIndices) {
        //   const compo = layerGlyph.components[index];
        //   const compoT = makeAffineTransform(compo.transformation);
        //   const newCompoT = t.transform(compoT);
        //   compo.transformation = decomposeAffineTransform(newCompoT);
        // }
      }

      let changes = ChangeCollector.fromChanges(
        consolidateChanges(editChanges),
        consolidateChanges(rollbackChanges)
      );

      return {
        changes: changes,
        undoLabel: undoLabel,
        broadcast: true,
      };
    });
  }

  _changeOrigin(keyX, keyY) {
    this.transformParameters.originX = keyX;
    this.transformParameters.originY = keyY;
    this.transformParameters.originXButton = undefined;
    this.transformParameters.originYButton = undefined;
    this.update();
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define("panel-selection-transformation", SelectionTransformationPanel);
