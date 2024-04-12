import {
  ChangeCollector,
  applyChange,
  consolidateChanges,
  hasChange,
} from "../core/changes.js";
import { EditBehaviorFactory, unpackContours } from "./edit-behavior.js";
import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import {
  filterPathByPointIndices,
  getSelectionByContour,
} from "/core/path-functions.js";
import { rectFromPoints, rectSize, unionRect } from "/core/rectangle.js";
import {
  Transform,
  decomposedFromTransform,
  prependTransformToDecomposed,
} from "/core/transform.js";
import { enumerate, parseSelection, range } from "/core/utils.js";
import { copyComponent } from "/core/var-glyph.js";
import { Form } from "/web-components/ui-form.js";

export default class TransformationPanel extends Panel {
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

  static stylesForm = `
  .ui-form-label {
    overflow-x: unset;
  }

  .origin-radio-buttons {
    display: grid;
    grid-template-columns: auto auto auto;
  }

  .origin-radio-buttons > input[type="radio"] {
    appearance: none;
    background-color: var(--editor-mini-console-background-color-light);
    margin: 2px;
    color: var(--editor-mini-console-background-color-light);
    width: 0.9em;
    height: 0.9em;
    border: 0.15em solid var(--editor-mini-console-background-color-light);
    border-radius: 50%;
    cursor: pointer;
  }

  .origin-radio-buttons > input[type="radio"]:hover {
    background-color: var(--text-input-background-color-dark);
    border: 0.15em solid var(--text-input-background-color-dark);
  }

  .origin-radio-buttons > input[type="radio"]:checked {
    background-color: var(--text-input-background-color-dark);
    border: 0.15em solid var(--text-input-background-color-dark);
  }
`;

  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();

    this.infoForm.appendStyle(TransformationPanel.stylesForm);
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
      distributeValue: undefined,
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
      "src": "/tabler-icons/arrow-move-right.svg",
      "onclick": (event) =>
        this._transformLayerGlyph(
          new Transform().translate(
            this.transformParameters.moveX,
            this.transformParameters.moveY
          ),
          "move"
        ),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Move",
      "data-tooltipposition": "top",
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
      "src": "/tabler-icons/resize.svg",
      "onclick": (event) =>
        this._transformLayerGlyph(
          new Transform().scale(
            this.transformParameters.scaleX / 100,
            (this.transformParameters.scaleY
              ? this.transformParameters.scaleY
              : this.transformParameters.scaleX) / 100
          ),
          "scale"
        ),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Scale",
      "data-tooltipposition": "top",
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
      "src": "/tabler-icons/rotate.svg",
      "onclick": (event) =>
        this._transformLayerGlyph(
          new Transform().rotate((this.transformParameters.rotation * Math.PI) / 180),
          "rotate"
        ),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Rotate",
      "data-tooltipposition": "top",
    });

    formContents.push({
      type: "edit-number",
      key: "rotation",
      label: buttonRotate,
      value: this.transformParameters.rotation,
    });

    let buttonSkew = html.createDomElement("icon-button", {
      "src": "/images/skew.svg",
      "onclick": (event) =>
        this._transformLayerGlyph(
          new Transform().skew(
            (this.transformParameters.skewX * Math.PI) / 180,
            (this.transformParameters.skewY * Math.PI) / 180
          ),
          "skew"
        ),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Skew",
      "data-tooltipposition": "top",
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
          "class": "ui-form-icon",
          "src": "/tabler-icons/flip-vertical.svg",
          "data-tooltip": "Flip vertically",
          "data-tooltipposition": "top",
          "onclick": (event) =>
            this._transformLayerGlyph(new Transform().scale(-1, 1), "flip vertically"),
        }),
        html.createDomElement("icon-button", {
          "class": "ui-form-icon",
          "src": "/tabler-icons/flip-horizontal.svg",
          "data-tooltip": "Flip horizontally",
          "data-tooltipposition": "top-right",
          "onclick": (event) =>
            this._transformLayerGlyph(
              new Transform().scale(1, -1),
              "flip horizontally"
            ),
        }),
      ],
    });

    formContents.push({ type: "spacer" });
    formContents.push({ type: "header", label: `Align Objects` });

    let buttonVerticalAlignTop = html.createDomElement("icon-button", {
      "src": "/tabler-icons/vertical-align-left.svg",
      "onclick": (event) => this._alignObjectsLayerGlyph("align left"),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Align left",
      "data-tooltipposition": "bottom-left",
    });

    formContents.push({
      type: "icons",
      label: buttonVerticalAlignTop,
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-center.svg",
          "onclick": (event) => this._alignObjectsLayerGlyph("align center"),
          "data-tooltip": "Align center",
          "data-tooltipposition": "bottom",
          "class": "ui-form-icon",
        }),
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-right.svg",
          "onclick": (event) => this._alignObjectsLayerGlyph("align right"),
          "data-tooltip": "Align right",
          "data-tooltipposition": "bottom-right",
          "class": "ui-form-icon",
        }),
      ],
    });

    let buttonHorizontalAlignTop = html.createDomElement("icon-button", {
      "src": "/tabler-icons/horizontal-align-top.svg",
      "onclick": (event) => this._alignObjectsLayerGlyph("align top"),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Align top",
      "data-tooltipposition": "bottom-left",
    });

    formContents.push({
      type: "icons",
      label: buttonHorizontalAlignTop,
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-center.svg",
          "onclick": (event) => this._alignObjectsLayerGlyph("align middle"),
          "data-tooltip": "Align middle",
          "data-tooltipposition": "bottom",
          "class": "ui-form-icon",
        }),
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-bottom.svg",
          "onclick": (event) => this._alignObjectsLayerGlyph("align bottom"),
          "data-tooltip": "Align bottom",
          "data-tooltipposition": "bottom-right",
          "class": "ui-form-icon",
        }),
      ],
    });

    formContents.push({ type: "spacer" });
    formContents.push({ type: "header", label: `Distribute Objects` });

    let buttonDistributeValue = html.createDomElement("icon-button", {
      "src": "/tabler-icons/layout-distribute-vertical.svg",
      "onclick": (event) => this._alignObjectsLayerGlyph("distribute horizontal"),
      "data-tooltip": "Distribute horizontal",
      "data-tooltipposition": "top-left",
      "class": "ui-form-icon ui-form-icon-button",
    });

    formContents.push({
      type: "icons",
      label: buttonDistributeValue,
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/layout-distribute-horizontal.svg",
          "onclick": (event) => this._alignObjectsLayerGlyph("distribute vertical"),
          "data-tooltip": "Distribute vertical",
          "data-tooltipposition": "top",
          "class": "ui-form-icon",
        }),
        html.createDomElement("input", {
          key: "distributeValue",
          onchange: (event) => console.log("distributeValue: ", event), //this.transformParameters.distributeValue = event,
          value: undefined,
          type: "number",
        }),
      ],
    });

    formContents.push({ type: "spacer" });

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

  _getPinPoint(layerGlyphController, originX, originY) {
    const bounds = layerGlyphController.getSelectionBounds(
      this.sceneController.selection
    );
    const { width, height } = rectSize(bounds);

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
    let { point: pointIndices, component: componentIndices } = parseSelection(
      this.sceneController.selection
    );

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
          editBehavior: behaviorFactory.getBehavior("default", true),
        };
      });

      const editChanges = [];
      const rollbackChanges = [];
      for (const { changePath, editBehavior, layerGlyphController } of layerInfo) {
        const layerGlyph = layerGlyphController.instance;
        const pinPoint = this._getPinPoint(
          layerGlyphController,
          this.transformParameters.originX,
          this.transformParameters.originY
        );

        const t = new Transform()
          .translate(pinPoint.x, pinPoint.y)
          .transform(transformation)
          .translate(-pinPoint.x, -pinPoint.y);

        const pointTransformFunction = t.transformPointObject.bind(t);

        const componentTransformFunction = (component, componentIndex) => {
          component = copyComponent(component);
          component.transformation = prependTransformToDecomposed(
            t,
            component.transformation
          );
          return component;
        };

        const editChange = editBehavior.makeChangeForTransformFunc(
          pointTransformFunction,
          null,
          componentTransformFunction
        );
        applyChange(layerGlyph, editChange);
        editChanges.push(consolidateChanges(editChange, changePath));
        rollbackChanges.push(
          consolidateChanges(editBehavior.rollbackChange, changePath)
        );
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

  _splitSelection(layerGlyphController, selection) {
    let { point: pointIndices, component: componentIndices } =
      parseSelection(selection);
    pointIndices = pointIndices || [];

    const points = [];
    const contours = [];
    const components = componentIndices ? componentIndices : [];

    if (!pointIndices.length) {
      return { points, contours, components };
    }

    const path = layerGlyphController.instance.path;
    const pathSelection = filterPathByPointIndices(
      layerGlyphController.instance.path,
      pointIndices
    );
    const selectionByContour = getSelectionByContour(path, pointIndices);

    let contourIndex = 0;
    for (const pointIndex of pointIndices) {
      while (path.contourInfo[contourIndex].endPoint < pointIndex) {
        contourIndex++;
      }

      let pathSelectionContourIndex;
      for (const [j, [cIndex, contourSelection]] of enumerate(selectionByContour)) {
        if (contourIndex === cIndex) {
          pathSelectionContourIndex = j;
          break;
        }
      }

      if (pathSelection.contourInfo[pathSelectionContourIndex].isClosed) {
        const contourStartIndex = !contourIndex
          ? 0
          : layerGlyphController.instance.path.contourInfo[contourIndex - 1].endPoint +
            1;
        const contourEndIndex = path.contourInfo[contourIndex].endPoint + 1;

        const contourPoints = Array.from(range(contourStartIndex, contourEndIndex));

        if (contourStartIndex === pointIndex) {
          // only add list of contours
          // if the point is the start of the contour
          contours.push(contourPoints);
        }
      } else {
        points.push(pointIndex);
      }
    }

    return { points, contours, components };
  }

  _getTranslationForObject(
    undoLabel,
    objectBounds,
    alignmentBounds,
    nextPosition,
    distributeSpacer
  ) {
    if (undoLabel.startsWith("align")) {
      return this._getTranslationForAlignObject(
        undoLabel,
        objectBounds,
        alignmentBounds
      );
    }
    if (undoLabel.startsWith("distribute")) {
      return this._getTranslationForDistributeObject(
        undoLabel,
        objectBounds,
        nextPosition,
        distributeSpacer
      );
    }
  }

  _getTranslationForAlignObject(undoLabel, objectBounds, alignmentBounds) {
    let translateX = 0;
    let translateY = 0;
    if (undoLabel === "align left") {
      translateX = alignmentBounds.xMin - objectBounds.xMin;
    }
    if (undoLabel === "align center") {
      const width = objectBounds.xMax - objectBounds.xMin;
      const widthAlignment = alignmentBounds.xMax - alignmentBounds.xMin;
      translateX =
        alignmentBounds.xMin - objectBounds.xMin + widthAlignment / 2 - width / 2;
    }
    if (undoLabel === "align right") {
      translateX = alignmentBounds.xMax - objectBounds.xMax;
    }
    if (undoLabel === "align top") {
      translateY = alignmentBounds.yMax - objectBounds.yMax;
    }
    if (undoLabel === "align middle") {
      const height = objectBounds.yMax - objectBounds.yMin;
      const heightAlignment = alignmentBounds.yMax - alignmentBounds.yMin;
      translateY =
        alignmentBounds.yMax - objectBounds.yMax + height / 2 - heightAlignment / 2;
    }
    if (undoLabel === "align bottom") {
      translateY = alignmentBounds.yMin - objectBounds.yMin;
    }
    return { translateX, translateY };
  }

  _getTranslationForDistributeObject(
    undoLabel,
    objectBounds,
    nextPosition,
    distributeSpacer
  ) {
    let translateX = 0;
    let translateY = 0;
    const objectWidth = objectBounds.xMax - objectBounds.xMin;
    const objectHeight = objectBounds.yMax - objectBounds.yMin;

    if (undoLabel === "distribute horizontal") {
      translateX = nextPosition.x - objectBounds.xMin;
      nextPosition.x += objectWidth;
      nextPosition.x += distributeSpacer.width;
    }
    if (undoLabel === "distribute vertical") {
      translateY = nextPosition.y - objectBounds.yMin;
      nextPosition.y += objectHeight;
      nextPosition.y += distributeSpacer.height;
    }

    return { translateX, translateY };
  }

  _alignObjectEditBehaviour(
    layerGlyph,
    selection,
    translateX,
    translateY,
    editChanges,
    changePath,
    rollbackChanges
  ) {
    const behaviorFactory = new EditBehaviorFactory(
      layerGlyph,
      selection,
      this.sceneController.experimentalFeatures.scalingEditBehavior
    );

    const t = new Transform().translate(translateX, translateY);
    const pointTransformFunction = t.transformPointObject.bind(t);
    const editBehavior = behaviorFactory.getBehavior("default");
    const editChange = editBehavior.makeChangeForTransformFunc(pointTransformFunction);

    applyChange(layerGlyph, editChange);
    editChanges.push(consolidateChanges(editChange, changePath));
    rollbackChanges.push(consolidateChanges(editBehavior.rollbackChange, changePath));
  }

  _getDistributeSpacer(
    layerGlyphController,
    selectionBounds,
    points,
    contours,
    components
  ) {
    if (this.transformParameters.distributeValue) {
      return {
        width: this.transformParameters.distributeValue,
        height: this.transformParameters.distributeValue,
      };
    }

    let effectiveUsedBounds = { width: 0, height: 0 };
    for (const pointIndices of contours) {
      const path = filterPathByPointIndices(
        layerGlyphController.instance.path,
        pointIndices
      );
      const b = path.getBounds();
      const width = b.xMax - b.xMin;
      const height = b.yMax - b.yMin;
      effectiveUsedBounds.width += width;
      effectiveUsedBounds.height += height;
    }

    for (const compoIndex of components) {
      const component = layerGlyphController.components[compoIndex];
      const b = component.bounds;
      const width = b.xMax - b.xMin;
      const height = b.yMax - b.yMin;
      effectiveUsedBounds.width += width;
      effectiveUsedBounds.height += height;
    }

    let dictributeObjectCount = contours.length + components.length;
    if (points.length && (contours.length || components.length)) {
      dictributeObjectCount += 1;
    }
    if (points.length && !contours.length && !components.length) {
      dictributeObjectCount = points.length;
    }

    const heightSelection = selectionBounds.yMax - selectionBounds.yMin;
    const widthSelection = selectionBounds.xMax - selectionBounds.xMin;
    const distributeSpacer = {
      width: (widthSelection - effectiveUsedBounds.width) / (dictributeObjectCount - 1),
      height:
        (heightSelection - effectiveUsedBounds.height) / (dictributeObjectCount - 1),
    };
    return distributeSpacer;
  }

  async _alignObjectsLayerGlyph(undoLabel) {
    let { point: pointIndices, component: componentIndices } = parseSelection(
      this.sceneController.selection
    );

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
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      const editChanges = [];
      const rollbackChanges = [];
      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        const layerGlyphController = staticGlyphControllers[layerName];
        const changePath = ["layers", layerName, "glyph"];

        const { points, contours, components } = this._splitSelection(
          layerGlyphController,
          this.sceneController.selection
        );

        let selectionBounds = layerGlyphController.getSelectionBounds(
          this.sceneController.selection
        );

        if (
          (contours.length == 1 && !components.length && !points.length) ||
          (components.length == 1 && !contours.length && !points.length) ||
          (points.length < 1 && !contours.length && !components.length)
        ) {
          // if only one object is selected
          // align with glyph bounding box
          selectionBounds = {
            xMin: 0,
            xMax: layerGlyphController.xAdvance,
            yMin: 0, // TODO: should be descender (for now use the baseline)
            yMax: this.fontController.unitsPerEm, // TODO: should be ascender
          };
        }

        const distributeSpacer = this._getDistributeSpacer(
          layerGlyphController,
          selectionBounds,
          points,
          contours,
          components
        );
        let nextPosition = { x: selectionBounds.xMin, y: selectionBounds.yMin };

        const layerGlyph = layerGlyphController.instance;

        // move points which are not a full contour
        for (const pointIndex of points) {
          const individualSelection = [`point/${pointIndex}`];
          const path = filterPathByPointIndices(layerGlyphController.instance.path, [
            pointIndex,
          ]);
          const { translateX, translateY } = this._getTranslationForObject(
            undoLabel,
            path.getBounds(),
            selectionBounds,
            nextPosition,
            distributeSpacer
          );

          this._alignObjectEditBehaviour(
            layerGlyph,
            individualSelection,
            translateX,
            translateY,
            editChanges,
            changePath,
            rollbackChanges
          );
        }

        // move each full contour
        for (const pointIndices of contours) {
          const individualSelection = pointIndices.map((point) => `point/${point}`);
          const path = filterPathByPointIndices(
            layerGlyphController.instance.path,
            pointIndices
          );

          const { translateX, translateY } = this._getTranslationForObject(
            undoLabel,
            path.getBounds(),
            selectionBounds,
            nextPosition,
            distributeSpacer
          );

          this._alignObjectEditBehaviour(
            layerGlyph,
            individualSelection,
            translateX,
            translateY,
            editChanges,
            changePath,
            rollbackChanges
          );
        }
        // move each component
        for (const compoIndex of componentIndices) {
          const individualSelection = [`component/${compoIndex}`];
          const component = layerGlyphController.components[compoIndex];
          const { translateX, translateY } = this._getTranslationForObject(
            undoLabel,
            component.bounds,
            selectionBounds,
            nextPosition,
            distributeSpacer
          );

          this._alignObjectEditBehaviour(
            layerGlyph,
            individualSelection,
            translateX,
            translateY,
            editChanges,
            changePath,
            rollbackChanges
          );
        }
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

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define("panel-transformation", TransformationPanel);
