import { applyChange, consolidateChanges } from "../core/changes.js";
import { PackedPathChangeRecorder } from "../core/change-recorder.js";
import { centeredRect, normalizeRect } from "../core/rectangle.js";
import { isSuperset, symmetricDifference } from "../core/set-ops.js";
import { boolInt, modulo } from "../core/utils.js";
import { VarPackedPath } from "../core/var-path.js";
import * as vector from "../core/vector.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";


export class PointerTool extends BaseTool {

  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;
    const selRect = centeredRect(point.x, point.y, size);
    sceneController.hoverSelection = this.sceneModel.selectionAtPoint(point, size);
    sceneController.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
    if (sceneController.hoverSelection?.size) {
      this.canvasController.canvas.style.cursor = "pointer";
    } else {
      this.canvasController.canvas.style.cursor = "default";
    }
  }

  async handleDrag(eventStream, initialEvent) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(initialEvent);
    const selection = this.sceneModel.selectionAtPoint(point, sceneController.mouseClickMargin);
    if (initialEvent.detail >= 2 || initialEvent.myTapCount >= 2) {
      await this.handleDoubleCick(selection, point);
      initialEvent.preventDefault();  // don't let our dbl click propagate to other elements
      return;
    }

    if (!this.sceneModel.selectedGlyphIsEditing) {
      sceneController.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      sceneController.selectedGlyphIsEditing = false;
      return;
    }

    const initialSelection = sceneController.selection;
    let initiateDrag = false;
    let initiateRectSelect = false;

    if (selection.size > 0) {
      if (event.shiftKey) {
        sceneController.selection = symmetricDifference(sceneController.selection, selection);
        if (isSuperset(sceneController.selection, selection)) {
          initiateDrag = true;
        }
      } else if (isSuperset(sceneController.selection, selection)) {
        initiateDrag = true;
      } else {
        sceneController.selection = selection;
        initiateDrag = true;
      }
    } else {
      if (!event.shiftKey) {
        sceneController.selection = selection;
      }
      initiateRectSelect = true;
    }

    if (initiateRectSelect || initiateDrag) {
      if (!await shouldInitiateDrag(eventStream, initialEvent)) {
        initiateRectSelect = false;
        initiateDrag = false;
        const selectedGlyph = this.sceneModel.glyphAtPoint(point);
        if (selectedGlyph && selectedGlyph != sceneController.selectedGlyph) {
          sceneController.selectedGlyph = selectedGlyph;
          sceneController.selectedGlyphIsEditing = false;
          return;
        }
      }
    }

    sceneController.hoveredGlyph = undefined;

    if (initiateRectSelect) {
      return await this.handleRectSelect(eventStream, initialEvent, initialSelection);
    }
    if (initiateDrag) {
      return await this.handleDragSelection(eventStream, initialEvent);
    }
  }

  async handleDoubleCick(selection, point) {
    const sceneController = this.sceneController;
    if (!selection || !selection.size) {
      sceneController.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      sceneController.selectedGlyphIsEditing = !!sceneController.selectedGlyph;
    } else {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
      const pointIndices = [];
      const componentIndices = [];
      for (const selItem of sceneController.selection) {
        let [tp, index] = selItem.split("/");
        index = parseInt(index);
        if (tp === "point") {
          pointIndices.push(index);
        } else if (tp === "component") {
          componentIndices.push(index);
        }
      }
      if (componentIndices.length) {
        componentIndices.sort();
        sceneController.doubleClickedComponentIndices = componentIndices;
        sceneController._dispatchEvent("doubleClickedComponents");
      } else if (pointIndices.length) {
        await this.handlePointsDoubleClick(pointIndices);
      }
    }
  }

  async handlePointsDoubleClick(pointIndices) {
    const editContext = await this.sceneController.getGlyphEditContext(this.sceneController);
    if (!editContext) {
      return;
    }
    const path = editContext.instance.path;
    const recorder = new PackedPathChangeRecorder(path);
    for (const pointIndex of pointIndices) {
      const pointType = path.pointTypes[pointIndex];
      const [prevIndex, prevPoint, nextIndex, nextPoint] = neighborPoints(path, pointIndex);
      if (
        ((!prevPoint || !nextPoint) || (!prevPoint.type && !nextPoint.type)) &&
        pointType !== VarPackedPath.SMOOTH_FLAG
      ) {
        continue;
      }
      if (pointType === VarPackedPath.ON_CURVE || pointType === VarPackedPath.SMOOTH_FLAG) {
        const newPointType = (
          pointType === VarPackedPath.ON_CURVE ?
          VarPackedPath.SMOOTH_FLAG : VarPackedPath.ON_CURVE
        )
        recorder.setPointType(pointIndex, newPointType);
        if (newPointType === VarPackedPath.SMOOTH_FLAG) {
          const anchorPoint = path.getPoint(pointIndex);
          if (prevPoint?.type && nextPoint?.type) {
            // Fix-up both incoming and outgoing handles
            const [newPrevPoint, newNextPoint] = alignHandles(prevPoint, anchorPoint, nextPoint);
            recorder.setPointPosition(prevIndex, newPrevPoint.x, newPrevPoint.y);
            recorder.setPointPosition(nextIndex, newNextPoint.x, newNextPoint.y);
          } else if (prevPoint?.type) {
            // Fix-up incoming handle
            const newPrevPoint = alignHandle(nextPoint, anchorPoint, prevPoint);
            recorder.setPointPosition(prevIndex, newPrevPoint.x, newPrevPoint.y);
          } else if (nextPoint?.type) {
            // Fix-up outgoing handle
            const newNextPoint = alignHandle(prevPoint, anchorPoint, nextPoint);
            recorder.setPointPosition(nextIndex, newNextPoint.x, newNextPoint.y);
          }
        }
      }
    }

    if (recorder.hasChange) {
      const undoInfo = {
        "label": "toggle smooth",
        "undoSelection": this.sceneController.selection,
        "redoSelection": this.sceneController.selection,
        "location": this.sceneController.getLocation(),
      }
      applyChange(editContext.instance, recorder.editChange);
      await editContext.editFinal(recorder.editChange, recorder.rollbackChange, undoInfo, true);
    }
  }

  async handleRectSelect(eventStream, initialEvent, initialSelection) {
    const sceneController = this.sceneController;
    const initialPoint = sceneController.localPoint(initialEvent);
    for await (const event of eventStream) {
      const currentPoint = sceneController.localPoint(event);
      const selRect = normalizeRect({
        "xMin": initialPoint.x,
        "yMin": initialPoint.y,
        "xMax": currentPoint.x,
        "yMax": currentPoint.y,
      });
      const selection = this.sceneModel.selectionAtRect(selRect);
      sceneController.selectionRect = selRect;

      if (event.shiftKey) {
        sceneController.selection = symmetricDifference(initialSelection, selection);
      } else {
        sceneController.selection = selection;
      }
    }
    sceneController.selectionRect = undefined;
  }

  async handleDragSelection(eventStream, initialEvent) {
    const sceneController = this.sceneController;
    const initialPoint = sceneController.localPoint(initialEvent);
    const undoInfo = {
      "label": "drag selection",
      "undoSelection": sceneController.selection,
      "redoSelection": sceneController.selection,
      "location": sceneController.getLocation(),
    }

    const editContext = await sceneController.getGlyphEditContext(sceneController);
    if (!editContext) {
      return;
    }

    const behaviorFactory = new EditBehaviorFactory(editContext.instance, sceneController.selection);
    let behaviorName = getBehaviorName(initialEvent);
    let editBehavior = behaviorFactory.getBehavior(behaviorName);

    let editChange;

    for await (const event of eventStream) {
      const newEditBehaviorName = getBehaviorName(event);
      if (behaviorName !== newEditBehaviorName) {
        applyChange(editContext.instance, editBehavior.rollbackChange);
        await editContext.editIncremental(editBehavior.rollbackChange);
        behaviorName = newEditBehaviorName;
        editBehavior = behaviorFactory.getBehavior(behaviorName);
      }
      const currentPoint = sceneController.localPoint(event);
      const delta = {"x": currentPoint.x - initialPoint.x, "y": currentPoint.y - initialPoint.y};
      editChange = editBehavior.makeChangeForDelta(delta)
      applyChange(editContext.instance, editChange);
      await editContext.editIncrementalMayDrop(editChange);
    }
    applyChange(editContext.instance, editChange);
    await editContext.editFinal(editChange, editBehavior.rollbackChange, undoInfo, true);
  }

}


function getBehaviorName(event) {
  const behaviorNames = [
    "default",
    "constrain",
    "alternate",
    "alternate-constrain",
  ];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}


function neighborPoints(path, pointIndex) {
  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
  const contourStartIndex = path.getAbsolutePointIndex(contourIndex, 0);
  const numPoints = path.getNumPointsOfContour(contourIndex);
  const isClosed = path.contourInfo[contourIndex].isClosed;
  let prevIndex = contourPointIndex - 1;
  let nextIndex = contourPointIndex + 1;
  if (path.contourInfo[contourIndex].isClosed) {
    prevIndex = modulo(prevIndex, numPoints);
    nextIndex = modulo(nextIndex, numPoints);
  }
  let prevPoint, nextPoint;
  if (prevIndex >= 0) {
    prevIndex += contourStartIndex;
    prevPoint = path.getPoint(prevIndex);
  } else {
    prevIndex = undefined;
  }
  if (nextIndex < numPoints) {
    nextIndex += contourStartIndex;
    nextPoint = path.getPoint(nextIndex);
  } else {
    nextIndex = undefined;
  }
  return [prevIndex, prevPoint, nextIndex, nextPoint];
}


function alignHandle(refPoint1, anchorPoint, handlePoint) {
  const direction = vector.subVectors(anchorPoint, refPoint1);
  return alignHandleAlongDirection(direction, anchorPoint, handlePoint);
}


function alignHandles(handleIn, anchorPoint, handleOut) {
  const handleVectorIn = vector.subVectors(anchorPoint, handleIn);
  const handleVectorOut = vector.subVectors(anchorPoint, handleOut);
  const directionIn = vector.subVectors(handleVectorOut, handleVectorIn);
  const directionOut = vector.subVectors(handleVectorIn, handleVectorOut);
  return [
    alignHandleAlongDirection(directionIn, anchorPoint, handleIn),
    alignHandleAlongDirection(directionOut, anchorPoint, handleOut),
  ];
}


function alignHandleAlongDirection(direction, anchorPoint, handlePoint) {
  const length = vector.vectorLength(vector.subVectors(handlePoint, anchorPoint));
  const handleVector = vector.mulVector(vector.normalizeVector(direction), length);
  return vector.roundVector(vector.addVectors(anchorPoint, handleVector));
}
