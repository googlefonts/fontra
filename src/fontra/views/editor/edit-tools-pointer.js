import { recordChanges } from "../core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "../core/changes.js";
import { connectContours, toggleSmooth } from "../core/path-functions.js";
import {
  centeredRect,
  normalizeRect,
  offsetRect,
  rectSize,
} from "../core/rectangle.js";
import { difference, isSuperset, symmetricDifference, union } from "../core/set-ops.js";
import { Transform, prependTransformToDecomposed } from "../core/transform.js";
import {
  boolInt,
  commandKeyProperty,
  enumerate,
  parseSelection,
  range,
} from "../core/utils.js";
import { VarPackedPath } from "../core/var-path.js";
import * as vector from "../core/vector.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { equalGlyphSelection } from "./scene-controller.js";
import {
  registerVisualizationLayerDefinition,
  strokeRoundNode,
} from "./visualization-layer-definitions.js";
import { copyComponent } from "/core/var-glyph.js";

const handleMarginValue = 10;

export class PointerTool extends BaseTool {
  iconPath = "/images/pointer.svg";
  identifier = "pointer-tool";

  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;
    const selRect = centeredRect(point.x, point.y, size);
    const { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      event.altKey
    );
    sceneController.hoverSelection = selection;
    sceneController.hoveredGlyph = undefined;
    sceneController.hoverPathHit = pathHit;

    if (!sceneController.hoverSelection.size && !sceneController.hoverPathHit) {
      sceneController.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
    }

    if (!this.editor.visualizationLayersSettings.model["fontra.bounds.selection"]) {
      this.setCursor();
      return;
    }

    const initialResizeHandlePoint = sceneController.selectedGlyphPoint(event);
    const initialResizeHandle = getInitialResizeHandle(
      sceneController,
      initialResizeHandlePoint,
      sceneController.selection,
      handleMarginValue * this.editor.visualizationLayers.scaleFactor
    );

    if (this.sceneController.sceneModel.hoverResizeHandle != initialResizeHandle) {
      this.sceneController.sceneModel.hoverResizeHandle = initialResizeHandle;
      this.canvasController.requestUpdate();
    }
    this.setCursorForResizeHandle(initialResizeHandle);
  }

  setCursorForResizeHandle(handleName) {
    if (handleName === "bottom-left" || handleName === "top-right") {
      this.setCursor("nesw-resize");
    } else if (handleName === "bottom-right" || handleName === "top-left") {
      this.setCursor("nwse-resize");
    } else if (handleName === "bottom-center" || handleName === "top-center") {
      this.setCursor("ns-resize");
    } else if (handleName === "middle-left" || handleName === "middle-right") {
      this.setCursor("ew-resize");
    } else {
      this.setCursor();
    }
  }

  setCursor(cursor = undefined) {
    if (cursor) {
      this.canvasController.canvas.style.cursor = cursor;
      return;
    }
    if (
      this.sceneController.hoverSelection?.size ||
      this.sceneController.hoverPathHit
    ) {
      this.canvasController.canvas.style.cursor = "pointer";
    } else {
      this.canvasController.canvas.style.cursor = "default";
    }
  }

  async handleDrag(eventStream, initialEvent) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(initialEvent);
    const size = sceneController.mouseClickMargin;
    const { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      initialEvent.altKey
    );
    let initialClickedPointIndex;
    if (!pathHit) {
      const { point: pointIndices } = parseSelection(selection);
      if (pointIndices?.length) {
        initialClickedPointIndex = pointIndices[0];
      }
    }
    if (initialEvent.detail == 2 || initialEvent.myTapCount == 2) {
      initialEvent.preventDefault(); // don't let our dbl click propagate to other elements
      eventStream.done();
      await this.handleDoubleClick(selection, point, initialEvent);
      return;
    }

    if (!this.sceneSettings.selectedGlyph?.isEditing) {
      this.sceneSettings.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      eventStream.done();
      return;
    }

    const initialSelection = sceneController.selection;
    let initiateDrag = false;
    let initiateRectSelect = false;

    const modeFunc = getSelectModeFunction(event);
    const newSelection = modeFunc(sceneController.selection, selection);
    const cleanSel = selection;
    if (
      !selection.size ||
      event.shiftKey ||
      event.altKey ||
      !isSuperset(sceneController.selection, cleanSel)
    ) {
      this._selectionBeforeSingleClick = sceneController.selection;
      sceneController.selection = newSelection;
    }

    if (isSuperset(sceneController.selection, cleanSel)) {
      initiateDrag = true;
    }
    if (!selection.size) {
      initiateRectSelect = true;
    }

    if (initiateRectSelect || initiateDrag) {
      if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
        initiateRectSelect = false;
        initiateDrag = false;
        if (!selection.size) {
          const selectedGlyph = this.sceneModel.glyphAtPoint(point);
          if (
            selectedGlyph &&
            !equalGlyphSelection(selectedGlyph, this.sceneSettings.selectedGlyph)
          ) {
            this.sceneSettings.selectedGlyph = selectedGlyph;
            eventStream.done();
            return;
          }
        }
      }
    }

    sceneController.hoveredGlyph = undefined;

    const handleMargin =
      handleMarginValue * this.editor.visualizationLayers.scaleFactor;
    const initialClickedResizeHandle = sceneController.selectedGlyphPoint(initialEvent);
    const initialResizeHandle = getInitialResizeHandle(
      this.sceneController,
      initialClickedResizeHandle,
      initialSelection,
      handleMargin
    );

    if (initiateRectSelect && !initialResizeHandle) {
      return await this.handleRectSelect(eventStream, initialEvent, initialSelection);
    } else if (initiateDrag && !initialResizeHandle) {
      this.sceneController.sceneModel.initialClickedPointIndex =
        initialClickedPointIndex;
      const result = await this.handleDragSelection(eventStream, initialEvent);
      delete this.sceneController.sceneModel.initialClickedPointIndex;
      return result;
    } else if (
      initialResizeHandle &&
      this.editor.visualizationLayersSettings.model["fontra.bounds.selection"]
    ) {
      sceneController.selection = initialSelection;
      this.sceneController.sceneModel.initialClickedResizeHandle = initialResizeHandle;
      return await this.handleDragSelectionBoundsResize(
        initialSelection,
        eventStream,
        initialEvent
      );
    }
  }

  async handleDoubleClick(selection, point, event) {
    const sceneController = this.sceneController;
    if (!sceneController.hoverPathHit && (!selection || !selection.size)) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph?.isUndefined) {
        sceneController._dispatchEvent("doubleClickedUndefinedGlyph");
      } else {
        const selectedGlyph = this.sceneModel.glyphAtPoint(point);
        this.sceneSettings.selectedGlyph = selectedGlyph
          ? { ...selectedGlyph, isEditing: true }
          : undefined;
      }
    } else {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
      const {
        point: pointIndices,
        component: componentIndices,
        anchor: anchorIndices,
        guideline: guidelineIndices,
        // TODO: Font Guidelines
        // fontGuideline: fontGuidelineIndices,
      } = parseSelection(sceneController.selection);
      if (componentIndices?.length && !pointIndices?.length && !anchorIndices?.length) {
        componentIndices.sort();
        sceneController.doubleClickedComponentIndices = componentIndices;
        sceneController._dispatchEvent("doubleClickedComponents");
      } else if (
        anchorIndices?.length &&
        !pointIndices?.length &&
        !componentIndices?.length
      ) {
        anchorIndices.sort();
        sceneController.doubleClickedAnchorIndices = anchorIndices;
        sceneController._dispatchEvent("doubleClickedAnchors");
      } else if (
        guidelineIndices?.length &&
        !pointIndices?.length &&
        !componentIndices?.length
      ) {
        guidelineIndices.sort();
        sceneController.doubleClickedGuidelineIndices = guidelineIndices;
        sceneController._dispatchEvent("doubleClickedGuidelines");
      } else if (pointIndices?.length && !sceneController.hoverPathHit) {
        await this.handlePointsDoubleClick(pointIndices);
      } else if (sceneController.hoverPathHit) {
        const contourIndex = sceneController.hoverPathHit.contourIndex;
        const startPoint = instance.path.getAbsolutePointIndex(contourIndex, 0);
        const endPoint = instance.path.contourInfo[contourIndex].endPoint;
        const newSelection = new Set();
        for (const i of range(startPoint, endPoint + 1)) {
          const pointType = instance.path.pointTypes[i] & VarPackedPath.POINT_TYPE_MASK;
          if (pointType === VarPackedPath.ON_CURVE) {
            newSelection.add(`point/${i}`);
          }
        }
        const selection = this._selectionBeforeSingleClick || sceneController.selection;
        this._selectionBeforeSingleClick = undefined;
        const modeFunc = getSelectModeFunction(event);
        sceneController.selection = modeFunc(selection, newSelection);
      }
    }
  }

  async handlePointsDoubleClick(pointIndices) {
    let newPointType;
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        newPointType = toggleSmooth(layerGlyph.path, pointIndices, newPointType);
      }
      return "Toggle Smooth";
    });
  }

  async handleRectSelect(eventStream, initialEvent, initialSelection) {
    const sceneController = this.sceneController;
    const initialPoint = sceneController.localPoint(initialEvent);
    for await (const event of eventStream) {
      const modifierEvent = sceneController.experimentalFeatures
        .rectSelectLiveModifierKeys
        ? event
        : initialEvent;
      const currentPoint = sceneController.localPoint(event);
      const selRect = normalizeRect({
        xMin: initialPoint.x,
        yMin: initialPoint.y,
        xMax: currentPoint.x,
        yMax: currentPoint.y,
      });
      const selection = this.sceneModel.selectionAtRect(
        selRect,
        modifierEvent.altKey ? (point) => !!point.type : (point) => !point.type
      );
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      sceneController.selectionRect = offsetRect(
        selRect,
        -positionedGlyph.x,
        -positionedGlyph.y
      );

      const modeFunc = getSelectModeFunction(modifierEvent);
      sceneController.selection = modeFunc(initialSelection, selection);
    }
    sceneController.selectionRect = undefined;
    this._selectionBeforeSingleClick = undefined;
  }

  async handleDragSelection(eventStream, initialEvent) {
    this._selectionBeforeSingleClick = undefined;
    const sceneController = this.sceneController;
    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const initialPoint = sceneController.localPoint(initialEvent);
      let behaviorName = getBehaviorName(initialEvent);

      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          sceneController.selection,
          sceneController.experimentalFeatures.scalingEditBehavior
        );
        return {
          layerName,
          layerGlyph,
          changePath: ["layers", layerName, "glyph"],
          pathPrefix: [],
          connectDetector: sceneController.getPathConnectDetector(layerGlyph.path),
          shouldConnect: false,
          behaviorFactory,
          editBehavior: behaviorFactory.getBehavior(behaviorName),
        };
      });

      layerInfo[0].isPrimaryLayer = true;

      let editChange;

      for await (const event of eventStream) {
        const newEditBehaviorName = getBehaviorName(event);
        if (behaviorName !== newEditBehaviorName) {
          // Behavior changed, undo current changes
          behaviorName = newEditBehaviorName;
          const rollbackChanges = [];
          for (const layer of layerInfo) {
            applyChange(layer.layerGlyph, layer.editBehavior.rollbackChange);
            rollbackChanges.push(
              consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
            );
            layer.editBehavior = layer.behaviorFactory.getBehavior(behaviorName);
          }
          await sendIncrementalChange(consolidateChanges(rollbackChanges));
        }
        const currentPoint = sceneController.localPoint(event);
        const delta = {
          x: currentPoint.x - initialPoint.x,
          y: currentPoint.y - initialPoint.y,
        };

        const deepEditChanges = [];
        for (const layer of layerInfo) {
          const editChange = layer.editBehavior.makeChangeForDelta(delta);
          applyChange(layer.layerGlyph, editChange);
          deepEditChanges.push(consolidateChanges(editChange, layer.changePath));
          layer.shouldConnect = layer.connectDetector.shouldConnect(
            layer.isPrimaryLayer
          );
        }

        editChange = consolidateChanges(deepEditChanges);
        await sendIncrementalChange(editChange, true); // true: "may drop"
      }
      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(
          layerInfo.map((layer) =>
            consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
          )
        )
      );
      let shouldConnect;
      for (const layer of layerInfo) {
        if (!layer.shouldConnect) {
          continue;
        }
        shouldConnect = true;
        if (layer.isPrimaryLayer) {
          layer.connectDetector.clearConnectIndicator();
        }

        const connectChanges = recordChanges(layer.layerGlyph, (layerGlyph) => {
          const selection = connectContours(
            layerGlyph.path,
            layer.connectDetector.connectSourcePointIndex,
            layer.connectDetector.connectTargetPointIndex
          );
          if (layer.isPrimaryLayer) {
            sceneController.selection = selection;
          }
        });
        if (connectChanges.hasChange) {
          changes = changes.concat(connectChanges.prefixed(layer.changePath));
        }
      }
      return {
        undoLabel: "drag selection" + (shouldConnect ? " and connect contours" : ""),
        changes: changes,
        broadcast: true,
      };
    });
  }

  async handleDragSelectionBoundsResize(selection, eventStream, initialEvent) {
    const sceneController = this.sceneController;
    const glyph = sceneController.sceneModel.getSelectedPositionedGlyph().glyph;
    const selectionBounds = getResizeBounds(glyph, selection);
    const selectionWidth = selectionBounds.xMax - selectionBounds.xMin;
    const selectionHeight = selectionBounds.yMax - selectionBounds.yMin;

    const initialClickedResizeHandle =
      this.sceneController.sceneModel.initialClickedResizeHandle;

    // The following may seem wrong to you, but it's correct.
    // Because we say for example bottom-left and not left-bottom. Y-X order.
    const originX = initialClickedResizeHandle.split("-")[1];
    const originY = initialClickedResizeHandle.split("-")[0];

    const origin = { x: originX, y: originY };
    // origin must be the opposite side of where we have our mouse
    if (originX === "left") {
      origin.x = "right";
    }
    if (originX === "right") {
      origin.x = "left";
    }
    if (originY === "top") {
      origin.y = "bottom";
    }
    // no else because could be middle or center
    if (originY === "bottom") {
      origin.y = "top";
    }

    // must be set to the opposite side of the mouse if left or bottom
    const directionX = initialClickedResizeHandle.includes("left") ? -1 : 1;
    const directionY = initialClickedResizeHandle.includes("bottom") ? -1 : 1;

    const staticGlyphControllers = await _getStaticGlyphControllers(
      this.sceneController.fontController,
      this.sceneController
    );

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const initialPoint = sceneController.selectedGlyphPoint(initialEvent);

      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          sceneController.selection,
          sceneController.experimentalFeatures.scalingEditBehavior
        );
        return {
          layerName,
          changePath: ["layers", layerName, "glyph"],
          layerGlyphController: staticGlyphControllers[layerName],
          editBehavior: behaviorFactory.getBehavior("default", true),
        };
      });

      let editChange;
      let pinPoint;
      let altKeyPressedOnce;
      for await (const event of eventStream) {
        const currentPoint = sceneController.selectedGlyphPoint(event);

        let scaleX =
          (selectionWidth + (currentPoint.x - initialPoint.x) * directionX) /
          selectionWidth;
        let scaleY =
          (selectionHeight + (currentPoint.y - initialPoint.y) * directionY) /
          selectionHeight;
        if (
          initialClickedResizeHandle === "middle-left" ||
          initialClickedResizeHandle === "middle-right"
        ) {
          scaleY = 1;
        }
        if (
          initialClickedResizeHandle === "top-center" ||
          initialClickedResizeHandle === "bottom-center"
        ) {
          scaleX = 1;
        }

        // scale proportionally if shift key is pressed
        if (event.shiftKey) {
          scaleX = scaleY;
        }
        let transformation = new Transform().scale(scaleX, scaleY);

        // altKeyPressedOnce variable is used to detect if altKey was pressed once
        if (event.altKey && !altKeyPressedOnce) {
          altKeyPressedOnce = true;
          pinPoint = undefined;
          origin.x = undefined;
          origin.y = undefined;
        }

        if (!event.altKey && altKeyPressedOnce) {
          altKeyPressedOnce = false;
          pinPoint = undefined;
          origin.x = originX;
          origin.y = originY;
        }

        const deepEditChanges = [];
        for (const { changePath, editBehavior, layerGlyphController } of layerInfo) {
          const layerGlyph = layerGlyphController.instance;
          // pinPoint need to be set for each layer individually,
          // but only once, except if altKey is pressed
          if (!pinPoint) {
            pinPoint = _getPinPoint(
              sceneController,
              layerGlyphController,
              origin.x,
              origin.y
            );
          }

          // rotation based on pinPoint
          if (event.ctrlKey) {
            const angleInital = Math.atan2(
              pinPoint.y - initialPoint.y,
              pinPoint.x - initialPoint.x
            );
            const angle = Math.atan2(
              pinPoint.y - currentPoint.y,
              pinPoint.x - currentPoint.x
            );
            // Do not do scale, because together with rotation it will be a mess
            transformation = new Transform().rotate(angle - angleInital);
          }

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
          deepEditChanges.push(consolidateChanges(editChange, changePath));
        }

        editChange = consolidateChanges(deepEditChanges);
        await sendIncrementalChange(editChange, true); // true: "may drop"
      }

      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(
          layerInfo.map((layer) =>
            consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
          )
        )
      );

      return {
        undoLabel: "resize selection",
        changes: changes,
        broadcast: true,
      };
    });
  }
}

function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
  return setB;
}

function getSelectModeFunction(event) {
  return event.shiftKey
    ? event[commandKeyProperty]
      ? difference
      : symmetricDifference
    : event[commandKeyProperty]
    ? union
    : replace;
}

registerVisualizationLayerDefinition({
  identifier: "fontra.bounds.selection",
  name: "Bounds of Selection",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: true,
  zIndex: 400,
  screenParameters: {
    strokeWidth: 1,
    lineDash: [2, 4],
    handleSize: 8,
    hoverStrokeOffset: 4,
    margin: handleMarginValue,
  },

  colors: { hoveredColor: "#DDD" },
  colorsDarkMode: { hoveredColor: "#555" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const resizeBounds = getResizeBounds(positionedGlyph.glyph, model.selection);
    if (!resizeBounds) {
      return;
    }

    context.strokeStyle = parameters.hoveredColor;
    context.lineWidth = parameters.strokeWidth;

    // draw resize handles
    const handles = getResizeHandles(resizeBounds, parameters.margin);
    for (const [handleName, handle] of Object.entries(handles)) {
      strokeRoundNode(context, handle, parameters.handleSize);
    }

    // draw resize handles hover
    if (model.hoverResizeHandle) {
      strokeRoundNode(
        context,
        handles[model.hoverResizeHandle],
        parameters.handleSize + parameters.hoverStrokeOffset
      );
    }

    // because of the dashed line draw resize bounding box last
    context.setLineDash(parameters.lineDash);
    context.strokeRect(
      resizeBounds.xMin,
      resizeBounds.yMin,
      resizeBounds.xMax - resizeBounds.xMin,
      resizeBounds.yMax - resizeBounds.yMin
    );
  },
});

function getResizeHandles(resizeBounds, margin) {
  const { width, height } = rectSize(resizeBounds);

  const [x, y, w, h] = [
    resizeBounds.xMin - margin,
    resizeBounds.yMin - margin,
    resizeBounds.xMax - resizeBounds.xMin + margin * 2,
    resizeBounds.yMax - resizeBounds.yMin + margin * 2,
  ];

  const handles = {
    "bottom-left": { x: x, y: y },
    "bottom-center": { x: x + w / 2, y: y },
    "bottom-right": { x: x + w, y: y },
    "top-left": { x: x, y: y + h },
    "top-center": { x: x + w / 2, y: y + h },
    "top-right": { x: x + w, y: y + h },
    "middle-left": { x: x, y: y + h / 2 },
    "middle-right": { x: x + w, y: y + h / 2 },
  };

  if (width != 0 && height != 0) {
    return handles;
  }

  for (const handleName of Object.keys(handles)) {
    if (width == 0 && handleName != "top-center" && handleName != "bottom-center") {
      delete handles[handleName];
    }
    if (height == 0 && handleName != "middle-left" && handleName != "middle-right") {
      delete handles[handleName];
    }
  }

  return handles;
}

// TODO: refactor this to a shared location
// this is basically a copy of the function in panel-transformation.js
async function _getStaticGlyphControllers(fontController, sceneController) {
  const varGlyphController =
    await sceneController.sceneModel.getSelectedVariableGlyphController();

  const editingLayers = sceneController.getEditingLayerFromGlyphLayers(
    varGlyphController.layers
  );
  const staticGlyphControllers = {};
  for (const [i, source] of enumerate(varGlyphController.sources)) {
    if (source.layerName in editingLayers) {
      staticGlyphControllers[source.layerName] =
        await fontController.getLayerGlyphController(
          varGlyphController.name,
          source.layerName,
          i
        );
    }
  }
  return staticGlyphControllers;
}

// TODO: refactor this to a shared location
// this is basically a copy of the function in panel-transformation.js
function _getPinPoint(sceneController, layerGlyphController, originX, originY) {
  const bounds = layerGlyphController.getSelectionBounds(sceneController.selection);
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

function getResizeBounds(glyph, selection) {
  const selectionBounds = glyph.getSelectionBounds(selection);
  if (!selectionBounds) {
    return false;
  }
  const { width, height } = rectSize(selectionBounds);
  if (width == 0 && height == 0) {
    // return false if for example only one point is selected
    return false;
  }

  return selectionBounds;
}

function getInitialResizeHandle(sceneController, point, selection, handleMargin) {
  const glyph = sceneController.sceneModel.getSelectedPositionedGlyph()?.glyph;
  if (!glyph) {
    return false;
  }

  const resizeSelectionBounds = getResizeBounds(glyph, selection);
  const resizeHandles = getResizeHandles(resizeSelectionBounds, handleMargin);
  for (const [handleName, handle] of Object.entries(resizeHandles)) {
    if (vector.distance(handle, point) < handleMargin / 2) {
      return handleName;
    }
  }
  return false;
}
