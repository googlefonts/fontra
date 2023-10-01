import { recordChanges } from "../core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "../core/changes.js";
import { insertHandles, insertPoint } from "../core/path-functions.js";
import { isEqualSet } from "../core/set-ops.js";
import { parseSelection } from "../core/utils.js";
import { VarPackedPath } from "../core/var-path.js";
import * as vector from "../core/vector.js";
import { constrainHorVerDiag } from "./edit-behavior.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";

export class PenTool extends BaseTool {
  iconPath = "/images/pointeradd.svg";
  identifier = "pen-tool";

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
    const { insertHandles, targetPoint } = this._getPathConnectTargetPoint(event);
    const prevInsertHandles = this.sceneModel.pathInsertHandles;
    const prevTargetPoint = this.sceneModel.pathConnectTargetPoint;

    if (
      !handlesEqual(insertHandles, prevInsertHandles) ||
      !pointsEqual(targetPoint, prevTargetPoint)
    ) {
      this.sceneModel.pathInsertHandles = insertHandles;
      this.sceneModel.pathConnectTargetPoint = targetPoint;
      this.canvasController.requestUpdate();
    }
  }

  get curveType() {
    return this.sceneController.experimentalFeatures.quadPenTool ? "quad" : "cubic";
  }

  deactivate() {
    delete this.sceneModel.pathInsertHandles;
    delete this.sceneModel.pathConnectTargetPoint;
    this.canvasController.requestUpdate();
  }

  setCursor() {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].setCursor();
    } else {
      this.canvasController.canvas.style.cursor = "crosshair";
    }
  }
  _getPathConnectTargetPoint(event) {
    // Requirements:
    // - we must have an edited glyph at an editable location
    // - we must be in append/prepend mode for an existing contour
    // - the hovered point must be eligible to connect to:
    //   - must be a start or end point of an open contour
    //   - must not be the currently selected point

    const hoveredPointIndex = getHoveredPointIndex(this.sceneController, event);

    const glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
    if (!glyphController.canEdit) {
      return {};
    }
    const path = glyphController.instance.path;

    const appendInfo = getAppendInfo(path, this.sceneController.selection);
    if (hoveredPointIndex === undefined && appendInfo.createContour) {
      const point = this.sceneController.localPoint(event);
      const size = this.sceneController.mouseClickMargin;
      const hit = this.sceneModel.pathHitAtPoint(point, size);
      if (event.altKey && hit.segment?.points?.length === 2) {
        const pt1 = hit.segment.points[0];
        const pt2 = hit.segment.points[1];
        const handle1 = vector.interpolateVectors(pt1, pt2, 1 / 3);
        const handle2 = vector.interpolateVectors(pt1, pt2, 2 / 3);
        return { insertHandles: { points: [handle1, handle2], hit: hit } };
      } else {
        return { targetPoint: hit };
      }
    }

    if (hoveredPointIndex === undefined || appendInfo.createContour) {
      return {};
    }

    const [contourIndex, contourPointIndex] =
      path.getContourAndPointIndex(hoveredPointIndex);
    const contourInfo = path.contourInfo[contourIndex];

    if (
      appendInfo.contourIndex == contourIndex &&
      appendInfo.contourPointIndex == contourPointIndex
    ) {
      // We're hovering over the source point
      return {};
    }

    if (
      contourInfo.isClosed ||
      (contourPointIndex != 0 && hoveredPointIndex != contourInfo.endPoint)
    ) {
      return {};
    }
    return { targetPoint: path.getPoint(hoveredPointIndex) };
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }

    if (this.sceneModel.pathConnectTargetPoint?.segment) {
      await this._handleInsertPoint();
    } else if (this.sceneModel.pathInsertHandles) {
      await this._handleInsertHandles();
    } else {
      await this._handleAddPoints(eventStream, initialEvent);
    }
  }

  async _handleInsertPoint() {
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      let selection;
      for (const layerGlyph of Object.values(layerGlyphs)) {
        selection = insertPoint(
          layerGlyph.path,
          this.sceneModel.pathConnectTargetPoint
        );
      }
      delete this.sceneModel.pathConnectTargetPoint;
      this.sceneController.selection = selection;
      return "Insert Point";
    });
  }

  async _handleInsertHandles() {
    const segmentPointIndices =
      this.sceneModel.pathInsertHandles.hit.segment.pointIndices;
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      let selection;
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const path = layerGlyph.path;
        selection = insertHandles(
          path,
          segmentPointIndices.map((i) => path.getPoint(i)),
          segmentPointIndices[1],
          this.curveType
        );
      }
      delete this.sceneModel.pathInsertHandles;
      this.sceneController.selection = selection;
      return "Insert Handles";
    });
  }

  async _handleAddPoints(eventStream, initialEvent) {
    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const secondaryLayers = Object.entries(
        this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        return {
          layerName,
          changePath: ["layers", layerName, "glyph"],
          glyph: layerGlyph,
        };
      });

      const {
        layerName: primaryLayerName,
        changePath: primaryChangePath,
        glyph: primaryLayerGlyph,
      } = secondaryLayers.shift();

      const thisPropagateChange = propagateChange.bind(
        null,
        primaryChangePath,
        secondaryLayers
      );

      const behavior = getPenToolBehavior(
        this.sceneController,
        initialEvent,
        primaryLayerGlyph.path,
        this.curveType
      );

      if (!behavior) {
        // Nothing to do
        return;
      }

      const initialChanges = recordChanges(primaryLayerGlyph, (primaryLayerGlyph) => {
        behavior.initialChanges(primaryLayerGlyph.path, initialEvent);
      });
      this.sceneController.selection = behavior.selection;
      const deepInitialChanges = thisPropagateChange(initialChanges.change);
      await sendIncrementalChange(deepInitialChanges);
      let preDragChanges = new ChangeCollector();
      let dragChanges = new ChangeCollector();

      if (await shouldInitiateDrag(eventStream, initialEvent)) {
        preDragChanges = recordChanges(primaryLayerGlyph, (primaryLayerGlyph) => {
          behavior.setupDrag(primaryLayerGlyph.path, initialEvent);
        });
        this.sceneController.selection = behavior.selection;
        const deepPreDragChanges = thisPropagateChange(preDragChanges.change);
        await sendIncrementalChange(deepPreDragChanges);
        for await (const event of eventStream) {
          dragChanges = recordChanges(primaryLayerGlyph, (primaryLayerGlyph) => {
            behavior.drag(primaryLayerGlyph.path, event);
          });
          const deepDragChanges = thisPropagateChange(dragChanges.change);
          await sendIncrementalChange(deepDragChanges, true); // true: "may drop"
        }
        const deepDragChanges = thisPropagateChange(dragChanges.change);
        await sendIncrementalChange(deepDragChanges);
      }

      const finalChanges = initialChanges.concat(preDragChanges, dragChanges);

      const deepFinalChanges = ChangeCollector.fromChanges(
        thisPropagateChange(finalChanges.change, false),
        thisPropagateChange(finalChanges.rollbackChange, false)
      );

      return {
        changes: deepFinalChanges,
        undoLabel: behavior.undoLabel,
      };
    });
  }
}

const AppendModes = {
  APPEND: "append",
  PREPEND: "prepend",
};

function getPenToolBehavior(sceneController, initialEvent, path, curveType) {
  const appendInfo = getAppendInfo(path, sceneController.selection);

  let behaviorFuncs;

  if (appendInfo.createContour) {
    // Let's add a new contour
    behaviorFuncs = {
      setup: [insertContourAndSetupAnchorPoint, insertAnchorPoint],
      setupDrag: insertHandleOut,
      drag: dragHandle,
    };
  } else {
    behaviorFuncs = {
      setup: [setupAnchorPoint, insertAnchorPoint],
      setupDrag: appendInfo.isOnCurve ? insertHandleOut : insertHandleInOut,
      drag: dragHandle,
    };

    const selectedPoint = path.getContourPoint(
      appendInfo.contourIndex,
      appendInfo.contourPointIndex
    );
    const clickedSelection = sceneController.sceneModel.pointSelectionAtPoint(
      sceneController.localPoint(initialEvent),
      sceneController.mouseClickMargin
    );
    if (isEqualSet(clickedSelection, sceneController.selection)) {
      // We clicked on the selected point
      if (selectedPoint.type) {
        // off-curve
        if (path.getNumPointsOfContour(appendInfo.contourIndex) < 2) {
          // Contour is a single off-curve point, let's not touch it
          return null;
        }
        behaviorFuncs = { setup: [deleteHandle] };
      } else {
        // on-curve
        behaviorFuncs = {
          setup: [setupExistingAnchorPoint],
          setupDrag: insertHandleOut,
          drag: dragHandle,
        };
      }
    } else if (clickedSelection.size === 1) {
      const { point: pointSelection } = parseSelection(clickedSelection);
      const pointIndex = pointSelection[0];
      if (pointIndex !== undefined) {
        const [clickedContourIndex, clickedContourPointIndex] =
          path.getContourAndPointIndex(pointIndex);
        const numClickedContourPoints = path.getNumPointsOfContour(clickedContourIndex);
        if (
          clickedContourPointIndex === 0 ||
          clickedContourPointIndex === numClickedContourPoints - 1
        ) {
          const clickedPoint = path.getContourPoint(
            clickedContourIndex,
            clickedContourPointIndex
          );
          if (clickedContourIndex === appendInfo.contourIndex) {
            // Close the current contour
            behaviorFuncs = { setup: [closeContour] };
          } else {
            // Connect to other open contour
            appendInfo.targetContourIndex = clickedContourIndex;
            appendInfo.targetContourPointIndex = clickedContourPointIndex;
            behaviorFuncs = { setup: [connectToContour] };
          }
          if (!clickedPoint.type && selectedPoint.type) {
            behaviorFuncs.setupDrag = insertHandleIn;
            behaviorFuncs.drag = dragHandle;
          }
        }
      }
    }
  }

  const getPointFromEvent = (event) => sceneController.selectedGlyphPoint(event);

  return new PenToolBehavior(getPointFromEvent, appendInfo, behaviorFuncs, curveType);
}

class PenToolBehavior {
  undoLabel = "add point(s)";

  constructor(getPointFromEvent, appendInfo, behaviorFuncs, curveType) {
    this.getPointFromEvent = getPointFromEvent;
    this.context = { ...appendInfo };
    this.context.curveType = curveType;
    this.context.appendBias = this.context.appendMode === AppendModes.APPEND ? 1 : 0;
    this.context.prependBias = this.context.appendMode === AppendModes.PREPEND ? 1 : 0;
    this.context.appendDirection =
      this.context.appendMode === AppendModes.APPEND ? +1 : -1;
    this.behaviorFuncs = behaviorFuncs;
  }

  get selection() {
    return this.context.selection || new Set();
  }

  initialChanges(path, event) {
    const point = this.getPointFromEvent(event);
    for (const func of this.behaviorFuncs.setup || []) {
      func(this.context, path, point, event.shiftKey);
    }
  }

  setupDrag(path, event) {
    const point = this.getPointFromEvent(event);
    this.behaviorFuncs.setupDrag?.(this.context, path, point, event.shiftKey);
  }

  drag(path, event) {
    const point = this.getPointFromEvent(event);
    this.behaviorFuncs.drag?.(this.context, path, point, event.shiftKey);
  }
}

function insertContourAndSetupAnchorPoint(context, path, point, shiftConstrain) {
  path.insertContour(context.contourIndex, emptyContour());
  context.anchorIndex = context.contourPointIndex;
}

function setupAnchorPoint(context, path, point, shiftConstrain) {
  context.anchorIndex = context.contourPointIndex + context.appendBias;
}

function setupExistingAnchorPoint(context, path, point, shiftConstrain) {
  context.anchorIndex = context.contourPointIndex;
  context.anchorPoint = path.getContourPoint(
    context.contourIndex,
    context.contourPointIndex
  );
}

function insertAnchorPoint(context, path, point, shiftConstrain) {
  point = vector.roundVector(point);
  path.insertPoint(context.contourIndex, context.anchorIndex, point);
  context.anchorPoint = point;
  context.selection = getPointSelection(
    path,
    context.contourIndex,
    context.anchorIndex
  );
}

function insertHandleOut(context, path, point, shiftConstrain) {
  point = vector.roundVector(point);
  _insertHandleOut(context, path, point);
  _setHandleOutAbsIndex(context, path);
  context.selection = getPointSelectionAbs(context.handleOutAbsIndex);
}

function insertHandleIn(context, path, point, shiftConstrain) {
  point = vector.roundVector(point);
  _insertHandleIn(context, path, point);
  _setHandleInAbsIndex(context, path);
  context.selection = new Set();
}

function insertHandleInOut(context, path, point, shiftConstrain) {
  point = vector.roundVector(point);
  _insertHandleIn(context, path, point);
  _insertHandleOut(context, path, point);
  _setHandleInAbsIndex(context, path);
  _setHandleOutAbsIndex(context, path);
  const anchorIndex = path.getAbsolutePointIndex(
    context.contourIndex,
    context.anchorIndex
  );
  path.pointTypes[anchorIndex] = VarPackedPath.SMOOTH_FLAG;
  context.selection = getPointSelectionAbs(context.handleOutAbsIndex);
}

function _insertHandleIn(context, path, point, shiftConstrain) {
  path.insertPoint(context.contourIndex, context.anchorIndex + context.prependBias, {
    ...point,
    type: context.curveType,
  });
  context.anchorIndex += context.appendBias;
}

function _insertHandleOut(context, path, point, shiftConstrain) {
  path.insertPoint(context.contourIndex, context.anchorIndex + context.appendBias, {
    ...point,
    type: context.curveType,
  });
  context.anchorIndex += context.prependBias;
}

function _setHandleInAbsIndex(context, path) {
  context.handleInAbsIndex = path.getAbsolutePointIndex(
    context.contourIndex,
    context.anchorIndex - context.appendDirection
  );
}

function _setHandleOutAbsIndex(context, path) {
  context.handleOutAbsIndex = path.getAbsolutePointIndex(
    context.contourIndex,
    context.anchorIndex + context.appendDirection
  );
}

function deleteHandle(context, path, point, shiftConstrain) {
  path.deletePoint(context.contourIndex, context.contourPointIndex);
  const anchorIndex = path.getAbsolutePointIndex(
    context.contourIndex,
    context.contourPointIndex - context.appendBias
  );
  path.pointTypes[anchorIndex] = VarPackedPath.ON_CURVE;
  context.selection = getPointSelectionAbs(anchorIndex);
}

function closeContour(context, path, point, shiftConstrain) {
  path.contourInfo[context.contourIndex].isClosed = true;
  const numPoints = path.getNumPointsOfContour(context.contourIndex);
  if (!context.contourPointIndex) {
    const lastPointIndex = numPoints - 1;
    const lastPoint = path.getContourPoint(context.contourIndex, lastPointIndex);
    path.deletePoint(context.contourIndex, lastPointIndex);
    path.insertPoint(context.contourIndex, 0, lastPoint);
  }
  // When appending, we pretend the anchor index is beyond the last point,
  // so we insert the handle at the end of the contour, instead of at the front
  context.anchorIndex = context.appendMode === AppendModes.APPEND ? numPoints : 0;
  context.anchorPoint = path.getContourPoint(context.contourIndex, 0);
  context.selection = getPointSelection(path, context.contourIndex, 0);
}

function dragHandle(context, path, point, shiftConstrain) {
  point = getHandle(point, context.anchorPoint, shiftConstrain);
  if (context.handleOutAbsIndex !== undefined) {
    path.setPointPosition(context.handleOutAbsIndex, point.x, point.y);
  }
  if (context.handleInAbsIndex !== undefined) {
    const oppositePoint = oppositeHandle(context.anchorPoint, point);
    path.setPointPosition(context.handleInAbsIndex, oppositePoint.x, oppositePoint.y);
  }
}

function connectToContour(context, path, point, shiftConstrain) {
  const isPrepend = context.appendMode === AppendModes.PREPEND;
  const targetContourBefore = context.targetContourIndex < context.contourIndex;
  const insertIndex = context.contourIndex - (targetContourBefore ? 1 : 0);
  const deleteIndices = [context.targetContourIndex, context.contourIndex];
  const sourceContourPoints = path.getUnpackedContour(context.contourIndex).points;
  const targetContourPoints = path.getUnpackedContour(
    context.targetContourIndex
  ).points;

  if (isPrepend === (context.targetContourPointIndex === 0)) {
    targetContourPoints.reverse();
  }
  const newContour = {
    points: isPrepend
      ? targetContourPoints.concat(sourceContourPoints)
      : sourceContourPoints.concat(targetContourPoints),
    isClosed: false,
  };
  if (targetContourBefore) {
    deleteIndices.reverse();
  }
  for (const index of deleteIndices) {
    path.deleteContour(index);
  }
  path.insertUnpackedContour(insertIndex, newContour);
  context.contourIndex = insertIndex;
  context.anchorIndex =
    context.appendMode === AppendModes.APPEND
      ? sourceContourPoints.length
      : (context.anchorIndex = targetContourPoints.length - 1);
  context.anchorPoint = path.getContourPoint(context.contourIndex, context.anchorIndex);
}

function getPointSelection(path, contourIndex, contourPointIndex) {
  const pointIndex = path.getAbsolutePointIndex(contourIndex, contourPointIndex);
  return new Set([`point/${pointIndex}`]);
}

function getPointSelectionAbs(pointIndex) {
  return new Set([`point/${pointIndex}`]);
}

function getAppendInfo(path, selection) {
  if (selection.size === 1) {
    const { point: pointSelection } = parseSelection(selection);
    const pointIndex = pointSelection?.[0];
    if (pointIndex !== undefined && pointIndex < path.numPoints) {
      const [contourIndex, contourPointIndex] =
        path.getContourAndPointIndex(pointIndex);
      const numPointsContour = path.getNumPointsOfContour(contourIndex);
      if (
        !path.contourInfo[contourIndex].isClosed &&
        (contourPointIndex === 0 || contourPointIndex === numPointsContour - 1)
      ) {
        // Let's append or prepend a point to an existing contour
        const appendMode =
          contourPointIndex || numPointsContour === 1
            ? AppendModes.APPEND
            : AppendModes.PREPEND;
        const isOnCurve = !path.getPoint(pointIndex).type;
        const createContour = false;
        return {
          contourIndex,
          contourPointIndex,
          appendMode,
          isOnCurve,
          createContour,
        };
      }
    }
  }
  return {
    contourIndex: path.contourInfo.length,
    contourPointIndex: 0,
    appendMode: AppendModes.APPEND,
    isOnCurve: undefined,
    createContour: true,
  };
}

function emptyContour() {
  return { coordinates: [], pointTypes: [], isClosed: false };
}

function getHandle(handleOut, anchorPoint, constrain) {
  if (constrain) {
    handleOut = shiftConstrain(anchorPoint, handleOut);
  }
  return vector.roundVector(handleOut);
}

function oppositeHandle(anchorPoint, handlePoint) {
  return vector.addVectors(
    anchorPoint,
    vector.mulVectorScalar(vector.subVectors(handlePoint, anchorPoint), -1)
  );
}

function shiftConstrain(anchorPoint, handlePoint) {
  const delta = constrainHorVerDiag(vector.subVectors(handlePoint, anchorPoint));
  return vector.addVectors(anchorPoint, delta);
}

function getHoveredPointIndex(sceneController, event) {
  const hoveredSelection = sceneController.sceneModel.pointSelectionAtPoint(
    sceneController.localPoint(event),
    sceneController.mouseClickMargin
  );
  if (!hoveredSelection.size) {
    return undefined;
  }

  const { point: pointSelection } = parseSelection(hoveredSelection);
  if (!pointSelection?.length) {
    return undefined;
  }
  return pointSelection[0];
}

function handlesEqual(handles1, handles2) {
  const points1 = handles1?.points;
  const points2 = handles2?.points;
  return (
    points1 === points2 ||
    (pointsEqual(points1?.[0], points2?.[0]) && pointsEqual(points1?.[1], points2?.[1]))
  );
}

function pointsEqual(point1, point2) {
  return point1 === point2 || (point1?.x === point2?.x && point1?.y === point2?.y);
}

function propagateChange(
  primaryChangePath,
  secondaryLayers,
  change,
  doApplyChange = true
) {
  const primaryChange = consolidateChanges(change, primaryChangePath);
  const layerChanges = secondaryLayers.map((layerInfo) => {
    if (doApplyChange) {
      applyChange(layerInfo.glyph, change);
    }
    return consolidateChanges(change, layerInfo.changePath);
  });
  return consolidateChanges([primaryChange, ...layerChanges]);
}
