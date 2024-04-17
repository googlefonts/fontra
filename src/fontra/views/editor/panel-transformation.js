import {
  ChangeCollector,
  applyChange,
  consolidateChanges,
  hasChange,
} from "../core/changes.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
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
import { enumerate, parseSelection, range, zip } from "/core/utils.js";
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
      type: "universal-row",
      field1: {
        type: "text",
        key: "LabelFlip",
        value: "Flip:",
      },
      field2: {
        type: "auxiliaryElement",
        key: "FlipVertically",
        auxiliaryElement: html.createDomElement("icon-button", {
          "class": "ui-form-icon",
          "src": "/tabler-icons/flip-vertical.svg",
          "data-tooltip": "Flip vertically",
          "data-tooltipposition": "top",
          "onclick": (event) =>
            this._transformLayerGlyph(new Transform().scale(-1, 1), "flip vertically"),
        }),
      },
      field3: {
        type: "auxiliaryElement",
        key: "FlipHorizontally",
        auxiliaryElement: html.createDomElement("icon-button", {
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
      },
    });

    formContents.push({ type: "spacer" });
    formContents.push({ type: "header", label: `Align Objects` });

    formContents.push({
      type: "universal-row",
      field1: {
        type: "auxiliaryElement",
        key: "AlignLeft",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-left.svg",
          "onclick": (event) => this.moveObjects(alignLeft), //this._alignObjects("align left"),
          "class": "ui-form-icon ui-form-icon-button",
          "data-tooltip": "Align left",
          "data-tooltipposition": "bottom-left",
        }),
      },
      field2: {
        type: "auxiliaryElement",
        key: "AlignCenter",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-center.svg",
          "onclick": (event) => this.moveObjects(alignCenter), //this._alignObjects("align center"),
          "data-tooltip": "Align center",
          "data-tooltipposition": "bottom",
          "class": "ui-form-icon",
        }),
      },
      field3: {
        type: "auxiliaryElement",
        key: "AlignRight",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-right.svg",
          "onclick": (event) => this.moveObjects(alignRight), //this._alignObjects("align right"),
          "data-tooltip": "Align right",
          "data-tooltipposition": "bottom-right",
          "class": "ui-form-icon",
        }),
      },
    });

    formContents.push({
      type: "universal-row",
      field1: {
        type: "auxiliaryElement",
        key: "AlignTop",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-top.svg",
          "onclick": (event) => this.moveObjects(alignTop), //this._alignObjects("align top"),
          "class": "ui-form-icon ui-form-icon-button",
          "data-tooltip": "Align top",
          "data-tooltipposition": "bottom-left",
        }),
      },
      field2: {
        type: "auxiliaryElement",
        key: "AlignMiddle",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-center.svg",
          "onclick": (event) => this.moveObjects(alignMiddle), //this._alignObjects("align middle"),
          "data-tooltip": "Align middle",
          "data-tooltipposition": "bottom",
          "class": "ui-form-icon",
        }),
      },
      field3: {
        type: "auxiliaryElement",
        key: "AlignMiddle",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-bottom.svg",
          "onclick": (event) => this.moveObjects(alignBottom), //this._alignObjects("align bottom"),
          "data-tooltip": "Align bottom",
          "data-tooltipposition": "bottom-right",
          "class": "ui-form-icon",
        }),
      },
    });

    formContents.push({ type: "spacer" });
    formContents.push({ type: "header", label: `Distribute Objects` });

    formContents.push({
      type: "universal-row",
      field1: {
        type: "auxiliaryElement",
        key: "distributeHorizontally",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/layout-distribute-vertical.svg",
          "onclick": (event) => this.moveObjects(distributeHorizontally), //this._alignObjects("distribute horizontal"),
          "data-tooltip": "Distribute horizontally",
          "data-tooltipposition": "top-left",
          "class": "ui-form-icon ui-form-icon-button",
        }),
      },
      field2: {
        type: "auxiliaryElement",
        key: "distributeVertically",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/layout-distribute-horizontal.svg",
          "onclick": (event) => this.moveObjects(distributeVertically), //this._alignObjects("distribute vertical"),
          "data-tooltip": "Distribute vertically",
          "data-tooltipposition": "top",
          "class": "ui-form-icon",
        }),
      },
      field3: {
        "type": "edit-number",
        "key": "distributeValue",
        "value": this.transformParameters.distributeValue,
        "allowUndefined": true,
        "data-tooltip": "Distance in units",
        "data-tooltipposition": "top-right",
      },
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

  async _getStaticGlyphControllers() {
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
    return staticGlyphControllers;
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

    const staticGlyphControllers = await this._getStaticGlyphControllers();

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

  _getSelectionOfObjectItem(objectItem) {
    const objectIdentifier = objectItem[0];

    if (objectIdentifier === "point" || objectIdentifier === "component") {
      return [`${objectIdentifier}/${objectItem[1]}`];
    }
    if (objectIdentifier === "contour") {
      return objectItem[1].map((pointIndex) => `point/${pointIndex}`);
    }
    return [];
  }

  _getObjectBounds(layerGlyphController, objectItem) {
    const selection = this._getSelectionOfObjectItem(objectItem);
    return layerGlyphController.getSelectionBounds(selection);
  }

  _splitSelection(layerGlyphController, selection) {
    let { point: pointIndices, component: componentIndices } =
      parseSelection(selection);
    pointIndices = pointIndices || [];

    const points = [];
    const contours = [];
    const components = componentIndices || [];

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

  _getTranslationForDistributeObject(
    indicator,
    objectBounds,
    nextPosition,
    distributionSpacing
  ) {
    let translateX = 0;
    let translateY = 0;
    const objectWidth = objectBounds.xMax - objectBounds.xMin;
    const objectHeight = objectBounds.yMax - objectBounds.yMin;

    if (indicator === "distribute horizontal") {
      translateX = nextPosition.x - objectBounds.xMin;
      nextPosition.x += objectWidth;
      nextPosition.x += distributionSpacing.width;
    }
    if (indicator === "distribute vertical") {
      translateY = nextPosition.y - objectBounds.yMin;
      nextPosition.y += objectHeight;
      nextPosition.y += distributionSpacing.height;
    }

    return { translateX, translateY };
  }

  _getDistributionSpacing(layerGlyphController, selectionBounds, objectsSorted) {
    if (!isNaN(this.transformParameters.distributeValue)) {
      return {
        width: this.transformParameters.distributeValue,
        height: this.transformParameters.distributeValue,
      };
    }

    const effectiveDimensions = { width: 0, height: 0 };
    for (const object of objectsSorted) {
      const bounds = this._getObjectBounds(layerGlyphController, object);
      const width = bounds.xMax - bounds.xMin;
      const height = bounds.yMax - bounds.yMin;
      effectiveDimensions.width += width;
      effectiveDimensions.height += height;
    }

    const heightSelection = selectionBounds.yMax - selectionBounds.yMin;
    const widthSelection = selectionBounds.xMax - selectionBounds.xMin;
    const distributionSpacing = {
      width: (widthSelection - effectiveDimensions.width) / (objectsSorted.length - 1),
      height:
        (heightSelection - effectiveDimensions.height) / (objectsSorted.length - 1),
    };
    return distributionSpacing;
  }

  _collectMovableObjects(controller) {
    const { points, contours, components } = this._splitSelection(
      controller,
      this.sceneController.selection
    );

    const movableObjects = [];
    for (const pointIndex of points) {
      const individualSelection = [`point/${pointIndex}`];
      movableObjects.push(new MovablePoint(pointIndex, individualSelection));
    }
    for (const [contourIndex, pointIndices] of enumerate(contours)) {
      const individualSelection = pointIndices.map(
        (pointIndex) => `point/${pointIndex}`
      );
      movableObjects.push(new MovableContour(contourIndex, individualSelection));
    }
    for (const componentIndex of components) {
      const individualSelection = [`component/${componentIndex}`];
      movableObjects.push(new MovableComponent(componentIndex, individualSelection));
    }
    return movableObjects;
  }

  async moveObjects(moveDescriptor) {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const movableObjects = this._collectMovableObjects(glyphController);
    if (movableObjects.length <= 1) {
      return;
    }

    const staticGlyphControllers = await this._getStaticGlyphControllers();
    await this.sceneController.editGlyph((sendIncrementalChange, glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      const editChanges = [];
      const rollbackChanges = [];
      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        const changePath = ["layers", layerName, "glyph"];
        const controller = staticGlyphControllers[layerName];

        const boundingBoxes = movableObjects.map((obj) =>
          obj.computeBounds(controller)
        );
        const deltas = moveDescriptor.computeDeltasFromBoundingBoxes(
          boundingBoxes,
          this.transformParameters.distributeValue
        );
        for (const [delta, movableObject] of zip(deltas, movableObjects)) {
          const [editChange, rollbackChange] = movableObject.getChangesForDelta(
            delta,
            layerGlyph,
            this.sceneController
          );
          applyChange(layerGlyph, editChange);
          editChanges.push(consolidateChanges(editChange, changePath));
          rollbackChanges.push(consolidateChanges(rollbackChange, changePath));
        }
      }

      let changes = ChangeCollector.fromChanges(
        consolidateChanges(editChanges),
        consolidateChanges(rollbackChanges)
      );

      return {
        changes: changes,
        undoLabel: moveDescriptor.undoLabel,
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

// Define MovableObject classes
class MovableBaseObject {
  constructor(selection) {
    this.selection = selection;
  }

  computeBounds(staticGlyphController) {
    return staticGlyphController.getSelectionBounds(this.selection);
  }

  getChangesForDelta(delta, layerGlyph, sceneController) {
    const behaviorFactory = new EditBehaviorFactory(
      layerGlyph,
      this.selection,
      sceneController.experimentalFeatures.scalingEditBehavior
    );

    const t = new Transform().translate(delta.x, delta.y);
    const pointTransformFunction = t.transformPointObject.bind(t);
    const editBehavior = behaviorFactory.getBehavior("default");
    const editChange = editBehavior.makeChangeForTransformFunc(pointTransformFunction);
    return [editChange, editBehavior.rollbackChange];
  }
}

class MovablePoint extends MovableBaseObject {
  constructor(pointIndex, selection) {
    super(selection);
    this.pointIndex = pointIndex;
  }
}

class MovableContour extends MovableBaseObject {
  constructor(pointIndices, selection) {
    super(selection);
    this.pointIndices = pointIndices;
  }
}

class MovableComponent extends MovableBaseObject {
  constructor(componentIndex, selection) {
    super(selection);
    this.componentIndex = componentIndex;
  }
}

// Define moveDescriptor objects
const alignLeft = {
  undoLabel: "align left",
  computeDeltasFromBoundingBoxes: (boundingBoxes) => {
    const xMins = boundingBoxes.map((bounds) => bounds.xMin);
    const left = Math.min(...xMins);
    return xMins.map((xMin) => ({
      x: left - xMin,
      y: 0,
    }));
  },
};

const alignCenter = {
  undoLabel: "align center",
  computeDeltasFromBoundingBoxes: (boundingBoxes) => {
    const xMaxes = boundingBoxes.map((bounds) => bounds.xMax);
    const xMins = boundingBoxes.map((bounds) => bounds.xMin);
    const left = Math.min(...xMins);
    const right = Math.max(...xMaxes);
    return boundingBoxes.map((bounds) => ({
      x: left - bounds.xMin + (right - left) / 2 - (bounds.xMax - bounds.xMin) / 2,
      y: 0,
    }));
  },
};

const alignRight = {
  undoLabel: "align right",
  computeDeltasFromBoundingBoxes: (boundingBoxes) => {
    const xMaxes = boundingBoxes.map((bounds) => bounds.xMax);
    const right = Math.max(...xMaxes);
    return xMaxes.map((xMax) => ({
      x: right - xMax,
      y: 0,
    }));
  },
};

const alignTop = {
  undoLabel: "align top",
  computeDeltasFromBoundingBoxes: (boundingBoxes) => {
    const yMaxes = boundingBoxes.map((bounds) => bounds.yMax);
    const top = Math.max(...yMaxes);
    return yMaxes.map((yMax) => ({
      x: 0,
      y: top - yMax,
    }));
  },
};

const alignMiddle = {
  undoLabel: "align middle",
  computeDeltasFromBoundingBoxes: (boundingBoxes) => {
    const yMaxes = boundingBoxes.map((bounds) => bounds.yMax);
    const yMins = boundingBoxes.map((bounds) => bounds.yMin);
    const bottom = Math.min(...yMins);
    const top = Math.max(...yMaxes);
    return boundingBoxes.map((bounds) => ({
      x: 0,
      y: top - bounds.yMax + (bounds.yMax - bounds.yMin) / 2 - (top - bottom) / 2,
    }));
  },
};

const alignBottom = {
  undoLabel: "align bottom",
  computeDeltasFromBoundingBoxes: (boundingBoxes) => {
    const yMins = boundingBoxes.map((bounds) => bounds.yMin);
    const bottom = Math.min(...yMins);
    return yMins.map((yMin) => ({
      x: 0,
      y: bottom - yMin,
    }));
  },
};

const distributeHorizontally = {
  undoLabel: "distribute horizontally",
  computeDeltasFromBoundingBoxes: (boundingBoxes, distributeValue) => {
    let effectiveWidth = 0;
    for (const bounds of boundingBoxes) {
      effectiveWidth += bounds.xMax - bounds.xMin;
    }
    const xMins = boundingBoxes.map((bounds) => bounds.xMin);
    const xMaxes = boundingBoxes.map((bounds) => bounds.xMax);
    const left = Math.min(...xMins);
    const right = Math.max(...xMaxes);

    let distributionSpacing =
      (right - left - effectiveWidth) / (boundingBoxes.length - 1);
    if (!isNaN(distributeValue)) {
      distributionSpacing = distributeValue;
    }

    let next = left;
    let deltas = [];
    for (const bounds of boundingBoxes) {
      const width = bounds.xMax - bounds.xMin;
      const delta = {
        x: next - bounds.xMin,
        y: 0,
      };
      deltas.push(delta);
      next += width + distributionSpacing;
    }
    return deltas;
  },
};

const distributeVertically = {
  undoLabel: "distribute vertically",
  computeDeltasFromBoundingBoxes: (boundingBoxes, distributeValue) => {
    let effectiveHeight = 0;
    for (const bounds of boundingBoxes) {
      effectiveHeight += bounds.yMax - bounds.yMin;
    }
    const yMins = boundingBoxes.map((bounds) => bounds.yMin);
    const yMaxes = boundingBoxes.map((bounds) => bounds.yMax);
    const bottom = Math.min(...yMins);
    const top = Math.max(...yMaxes);

    let distributionSpacing =
      (top - bottom - effectiveHeight) / (boundingBoxes.length - 1);
    console.log("distributionSpacing: ", distributionSpacing);
    if (!isNaN(distributeValue)) {
      distributionSpacing = distributeValue;
    }
    console.log("distributionSpacing: ", distributionSpacing);

    let next = bottom;
    let deltas = [];
    for (const bounds of boundingBoxes) {
      const height = bounds.yMax - bounds.yMin;
      const delta = {
        x: 0,
        y: next - bounds.yMin,
      };
      deltas.push(delta);
      next += height + distributionSpacing;
    }
    return deltas;
  },
};

customElements.define("panel-transformation", TransformationPanel);
