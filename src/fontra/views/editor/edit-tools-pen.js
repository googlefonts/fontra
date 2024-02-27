import { recordChanges } from "../core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "../core/changes.js";
import { insertHandles, insertPoint, scalePoint } from "../core/path-functions.js";
import { isEqualSet } from "../core/set-ops.js";
import { modulo, parseSelection } from "../core/utils.js";
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
    const { insertHandles, targetPoint, danglingOffCurve, canDragOffCurve } =
      this._getPathConnectTargetPoint(event);
    const prevInsertHandles = this.sceneModel.pathInsertHandles;
    const prevTargetPoint = this.sceneModel.pathConnectTargetPoint;
    const prevDanglingOffCurve = this.sceneModel.pathDanglingOffCurve;
    const prevCanDragOffCurve = this.sceneModel.pathCanDragOffCurve;

    if (
      !handlesEqual(insertHandles, prevInsertHandles) ||
      !pointsEqual(targetPoint, prevTargetPoint) ||
      !pointsEqual(danglingOffCurve, prevDanglingOffCurve) ||
      !pointsEqual(canDragOffCurve, prevCanDragOffCurve)
    ) {
      this.sceneModel.pathInsertHandles = insertHandles;
      this.sceneModel.pathConnectTargetPoint = targetPoint;
      this.sceneModel.pathDanglingOffCurve = danglingOffCurve;
      this.sceneModel.pathCanDragOffCurve = canDragOffCurve;
      this.canvasController.requestUpdate();
    }
  }

  get curveType() {
    return this.sceneController.experimentalFeatures.quadPenTool ? "quad" : "cubic";
  }

  deactivate() {
    this._resetHover();
    this.canvasController.requestUpdate();
  }

  _resetHover() {
    delete this.sceneModel.pathInsertHandles;
    delete this.sceneModel.pathConnectTargetPoint;
    delete this.sceneModel.pathDanglingOffCurve;
    delete this.sceneModel.pathCanDragOffCurve;
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
      // The following max() call makes sure that the margin is never
      // less than half a font unit. This works around a visualization
      // artifact caused by bezier-js: Bezier.project() returns t values
      // with a max precision of 0.001.
      const size = Math.max(1, this.sceneController.mouseClickMargin);
      const hit = this.sceneModel.pathHitAtPoint(point, size);
      if (event.altKey && hit.segment?.points?.length === 2) {
        const pt1 = hit.segment.points[0];
        const pt2 = hit.segment.points[1];
        const handle1 = vector.roundVector(vector.interpolateVectors(pt1, pt2, 1 / 3));
        const handle2 = vector.roundVector(vector.interpolateVectors(pt1, pt2, 2 / 3));
        return { insertHandles: { points: [handle1, handle2], hit: hit } };
      } else {
        const targetPoint = { ...hit };
        if ("x" in targetPoint) {
          // Don't use vector.roundVector, as there are more properties besides
          // x and y, and we want to preserve them
          targetPoint.x = Math.round(targetPoint.x);
          targetPoint.y = Math.round(targetPoint.y);
        }
        return { targetPoint: targetPoint };
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
      const point = path.getPoint(hoveredPointIndex);
      if (!appendInfo.isOnCurve) {
        return { danglingOffCurve: point };
      } else {
        return { canDragOffCurve: point };
      }
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
    console.log("Olli PenTool.handleDrag");
    console.log("Olli eventStream", eventStream);
    console.log("Olli initialEvent", initialEvent);

    if (this.sceneModel.pathConnectTargetPoint?.segment) {
      console.log(
        "Olli if this.sceneModel.pathConnectTargetPoint?.segment: _handleInsertPoint"
      );
      await this._handleInsertPoint();
    } else if (this.sceneModel.pathInsertHandles) {
      console.log("Olli if this.sceneModel.pathInsertHandles: _handleInsertHandles");
      await this._handleInsertHandles();
    } else {
      console.log("Olli else: _handleInsertPoint");
      this._resetHover();
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
    console.log("1 Olli PenTool._handleAddPoints");
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

      console.log(
        "1.1 Olli PenTool._handleAddPoints primaryChangePath",
        primaryChangePath
      );

      console.log("2 Olli PenTool._handleAddPoints secondaryLayers", secondaryLayers);
      console.log(
        "2 Olli PenTool._handleAddPoints primaryLayerGlyph",
        primaryLayerGlyph
      );

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

      console.log("Olli PenTool._handleAddPoints behavior", behavior);

      if (!behavior) {
        // Nothing to do
        return;
      }

      const initialChanges = recordChanges(primaryLayerGlyph, (primaryLayerGlyph) => {
        behavior.initialChanges(primaryLayerGlyph.path, initialEvent);
      });
      this.sceneController.selection = behavior.selection;
      console.log("Olli initialChanges.change", initialChanges.change);

      console.log("Olli initialEvent.shiftKey", initialEvent.shiftKey);
      if (initialEvent.shiftKey) {
        if (initialChanges.change.f === "insertPoint") {
          console.log("Olli changing insertPoint");
          console.log(
            "Olli changing insertPoint initialChanges.change.a[2].x",
            initialChanges.change.a[2].x
          );
          console.log(
            "Olli changing insertPoint initialChanges.change.a[2].y",
            initialChanges.change.a[2].y
          );
          initialChanges.change.a[2].x = Math.round(initialChanges.change.a[2].x + 100);
          initialChanges.change.a[2].y = Math.round(initialChanges.change.a[2].y + 100);
          console.log(
            "Olli changing insertPoint initialChanges.change.a[2].x",
            initialChanges.change.a[2].x
          );
          console.log(
            "Olli changing insertPoint initialChanges.change.a[2].y",
            initialChanges.change.a[2].y
          );
        }
      }

      const deepInitialChanges = thisPropagateChange(initialChanges.change);
      await sendIncrementalChange(deepInitialChanges);
      let preDragChanges = new ChangeCollector();
      let dragChanges = new ChangeCollector();
      console.log("Olli PenTool._handleAddPoints preDragChanges", preDragChanges);

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
      } else {
        dragChanges = recordChanges(primaryLayerGlyph, (primaryLayerGlyph) => {
          behavior.noDrag(primaryLayerGlyph.path);
        });
        this.sceneController.selection = behavior.selection;
      }
      console.log(
        "Olli PenTool._handleAddPoints preDragChanges.change",
        preDragChanges
      );
      console.log("Olli PenTool._handleAddPoints dragChanges.change", dragChanges);

      const deepDragChanges = thisPropagateChange(dragChanges.change);

      console.log("Olli deepDragChanges", deepDragChanges);

      await sendIncrementalChange(deepDragChanges);

      const finalChanges = initialChanges.concat(preDragChanges, dragChanges);
      console.log(
        "Olli PenTool._handleAddPoints finalChanges.change",
        finalChanges.change
      );
      console.log(
        "Olli PenTool._handleAddPoints finalChanges.rollbackChange",
        finalChanges.rollbackChange
      );

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
  console.log("Olli getPenToolBehavior appendInfo", appendInfo);
  console.log("Olli getPenToolBehavior curveType", curveType);
  console.log("Olli getPenToolBehavior path", path);
  console.log("Olli getPenToolBehavior initialEvent", initialEvent);

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
      noDrag: ensureCubicOffCurves,
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
          noDrag: clickOnCurveNoDragSetSelection,
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
            behaviorFuncs = { setup: [closeContour], noDrag: ensureCubicOffCurves };
          } else {
            // Connect to other open contour
            appendInfo.targetContourIndex = clickedContourIndex;
            appendInfo.targetContourPointIndex = clickedContourPointIndex;
            behaviorFuncs = { setup: [connectToContour], noDrag: ensureCubicOffCurves };
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

  noDrag(path) {
    this.behaviorFuncs.noDrag?.(this.context, path);
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
  context.selection = getPointSelection(
    path,
    context.contourIndex,
    context.anchorIndex
  );
}

function ensureCubicOffCurves(context, path) {
  if (
    context.curveType !== "cubic" ||
    context.isOnCurve ||
    path.getNumPointsOfContour(context.contourIndex) < 3
  ) {
    return;
  }

  const [prevPrevPoint, prevPoint] = [
    context.anchorIndex - 2 * context.appendDirection,
    context.anchorIndex - context.appendDirection,
  ].map((i) => path.getContourPoint(context.contourIndex, i));
  const thisPoint = context.anchorPoint;

  if (prevPrevPoint.type || !prevPoint.type || thisPoint.type) {
    // Sanity check: we expect on-curve/off-curve/on-curve
    return;
  }

  // Compute handles for a cubic segment that will look the same as the
  // one-off-curve quad segment we have.
  const [handle1, handle2] = [prevPrevPoint, thisPoint].map((point) => {
    return {
      ...vector.roundVector(scalePoint(point, prevPoint, 2 / 3)),
      type: "cubic",
    };
  });

  path.setContourPoint(
    context.contourIndex,
    context.anchorIndex - context.appendDirection,
    handle1
  );
  path.insertPoint(
    context.contourIndex,
    context.anchorIndex + context.prependBias,
    handle2
  );
  context.selection = getPointSelection(
    path,
    context.contourIndex,
    modulo(
      context.anchorIndex + context.appendBias,
      path.getNumPointsOfContour(context.contourIndex)
    )
  );
}

function clickOnCurveNoDragSetSelection(context, path) {
  context.selection = getPointSelection(
    path,
    context.contourIndex,
    context.anchorIndex
  );
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
