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
        this.transformSelection(
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
        this.transformSelection(
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
        this.transformSelection(
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
        this.transformSelection(
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
            this.transformSelection(new Transform().scale(-1, 1), "flip vertically"),
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
            this.transformSelection(new Transform().scale(1, -1), "flip horizontally"),
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
          "onclick": (event) => this.moveObjects(alignLeft),
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
          "onclick": (event) => this.moveObjects(alignCenter),
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
          "onclick": (event) => this.moveObjects(alignRight),
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
          "onclick": (event) => this.moveObjects(alignTop),
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
          "onclick": (event) => this.moveObjects(alignMiddle),
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
          "onclick": (event) => this.moveObjects(alignBottom),
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
          "onclick": (event) => this.moveObjects(distributeHorizontally),
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
          "onclick": (event) => this.moveObjects(distributeVertically),
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

  async transformSelection(transformation, undoLabel) {
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

  _collectMovableObjects(moveDescriptor, controller) {
    const { points, contours, components } = this._splitSelection(
      controller,
      this.sceneController.selection
    );

    const movableObjects = [];
    for (const pointIndex of points) {
      const individualSelection = [`point/${pointIndex}`];
      movableObjects.push(new MovableObject(individualSelection));
    }
    for (const [contourIndex, pointIndices] of enumerate(contours)) {
      const individualSelection = pointIndices.map(
        (pointIndex) => `point/${pointIndex}`
      );
      movableObjects.push(new MovableObject(individualSelection));
    }
    for (const componentIndex of components) {
      const individualSelection = [`component/${componentIndex}`];
      movableObjects.push(new MovableObject(individualSelection));
    }

    if (moveDescriptor.compareObjects) {
      movableObjects.sort((a, b) => moveDescriptor.compareObjects(a, b, controller));
    }

    return movableObjects;
  }

  async moveObjects(moveDescriptor) {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const movableObjects = this._collectMovableObjects(moveDescriptor, glyphController);
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
          const [editChange, rollbackChange] = movableObject.makeChangesForDelta(
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
class MovableObject {
  constructor(selection) {
    this.selection = selection;
  }

  computeBounds(staticGlyphController) {
    return staticGlyphController.getSelectionBounds(this.selection);
  }

  makeChangesForDelta(delta, layerGlyph, sceneController) {
    const behaviorFactory = new EditBehaviorFactory(
      layerGlyph,
      this.selection,
      sceneController.experimentalFeatures.scalingEditBehavior
    );

    const editBehavior = behaviorFactory.getBehavior("default");
    const editChange = editBehavior.makeChangeForDelta(delta);
    return [editChange, editBehavior.rollbackChange];
  }
}

// Define moveDescriptor objects
class AlignObjectsDescriptor {
  constructor(descriptor, position, directionVar) {
    this.position = position;
    this.undoLabel = `align ${descriptor}`;
    this.minProperty = `${directionVar}Min`;
    this.maxProperty = `${directionVar}Max`;
    this.property = `${directionVar}${position}`;
    this.deltaProperty = directionVar;
  }

  computeDeltasFromBoundingBoxes(boundingBoxes) {
    const maxes = boundingBoxes.map((bounds) => bounds[this.maxProperty]);
    const mins = boundingBoxes.map((bounds) => bounds[this.minProperty]);
    let maximum = Math.max(...maxes);
    let minimum = Math.min(...mins);
    let deltas = [];
    for (const bounds of boundingBoxes) {
      const delta = { x: 0, y: 0 };
      if (this.position === "Center") {
        delta[this.deltaProperty] =
          maximum -
          bounds[this.maxProperty] +
          (bounds[this.maxProperty] - bounds[this.minProperty]) / 2 -
          (maximum - minimum) / 2;
      } else {
        const pos = this.position === "Min" ? minimum : maximum;
        delta[this.deltaProperty] = pos - bounds[this.property];
      }
      deltas.push(delta);
    }
    return deltas;
  }
}

const alignBottom = new AlignObjectsDescriptor("bottom", "Min", "y");
const alignTop = new AlignObjectsDescriptor("top", "Max", "y");
const alignLeft = new AlignObjectsDescriptor("left", "Min", "x");
const alignRight = new AlignObjectsDescriptor("right", "Max", "x");
const alignMiddle = new AlignObjectsDescriptor("middle", "Center", "y");
const alignCenter = new AlignObjectsDescriptor("center", "Center", "x");

class DistributeObjectsDescriptor {
  constructor(direction, directionVar) {
    this.undoLabel = `distribute ${direction}`;
    this.minProperty = `${directionVar}Min`;
    this.maxProperty = `${directionVar}Max`;
    this.deltaProperty = directionVar;
  }

  computeDeltasFromBoundingBoxes(boundingBoxes, distributeValue) {
    let effectiveSize = 0;
    for (const bounds of boundingBoxes) {
      effectiveSize += bounds[this.maxProperty] - bounds[this.minProperty];
    }
    const mins = boundingBoxes.map((bounds) => bounds[this.minProperty]);
    const maxes = boundingBoxes.map((bounds) => bounds[this.maxProperty]);
    const minimum = Math.min(...mins);
    const maximum = Math.max(...maxes);

    let distributionSpacing =
      (maximum - minimum - effectiveSize) / (boundingBoxes.length - 1);
    if (!isNaN(distributeValue)) {
      distributionSpacing = distributeValue;
    }

    let next = minimum;
    let deltas = [];
    for (const bounds of boundingBoxes) {
      const dimentions = bounds[this.maxProperty] - bounds[this.minProperty];
      const delta = { x: 0, y: 0 };
      delta[this.deltaProperty] = next - bounds[this.minProperty];
      deltas.push(delta);
      next += dimentions + distributionSpacing;
    }
    return deltas;
  }

  compareObjects(a, b, controller) {
    return (
      a.computeBounds(controller)[this.minProperty] -
      b.computeBounds(controller)[this.minProperty]
    );
    // Btw. I still think this should sort based on the center, not the left or bottom
  }
}

const distributeHorizontally = new DistributeObjectsDescriptor("horizontally", "x");
const distributeVertically = new DistributeObjectsDescriptor("vertically", "y");

customElements.define("panel-transformation", TransformationPanel);
