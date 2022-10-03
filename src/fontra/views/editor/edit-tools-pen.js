import { consolidateChanges } from "../core/changes.js";
import { reversed, roundPoint } from "../core/utils.js";
import * as vector from "../core/vector.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { constrainHorVerDiag } from "./edit-behavior.js";


export class PenTool extends BaseTool {

  handleHover(event) {
    if (!this.sceneModel.selectedGlyphIsEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.canvasController.canvas.style.cursor = "crosshair";
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyphIsEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }
    const anchorPoint = roundPoint(this.sceneController.selectedGlyphPoint(initialEvent));
    const editContext = await this.sceneController.getGlyphEditContext(this);
    if (!editContext) {
      return;
    }

    let rollbackChanges = [];
    let editChanges = [];

    const instance = editContext.glyphController.instance;
    const path = instance.path;

    const initialSelection = this.sceneController.selection;

    let [contourIndex, contourPointIndex, isAppend] = getAppendIndices(initialSelection, path);

    if (contourIndex === undefined) {
      // Let's add a new contour
      contourIndex = path.numContours;
      contourPointIndex = 0;

      rollbackChanges.push(deleteContour(contourIndex));
      editChanges.push(appendEmptyContour(contourIndex));
    }

    let contourStartPoint;
    if (contourIndex >= path.numContours) {
      contourStartPoint = path.numPoints;
    } else {
      contourStartPoint = path.getAbsolutePointIndex(contourIndex, 0, true);
    }
    let newSelection = new Set([`point/${contourStartPoint + contourPointIndex}`]);

    rollbackChanges.push(deletePoint(contourIndex, contourPointIndex));
    editChanges.push(insertPoint(contourIndex, contourPointIndex, anchorPoint));

    this.sceneController.selection = newSelection;

    await editContext.editBegin();
    await editContext.editSetRollback(consolidateChanges([...reversed(rollbackChanges)]));
    await editContext.editIncremental(consolidateChanges(editChanges));

    const event = await shouldInitiateDrag(eventStream, initialEvent)
    if (event) {
      // Let's start over, revert the last insertPoint
      rollbackChanges.splice(-1);
      editChanges.splice(-1);

      let handleOut = this._getHandle(event, anchorPoint);
      let handleIn = oppositeHandle(anchorPoint, handleOut);

      let handleInIndex, anchorIndex, handleOutIndex;
      let insertIndices;
      if (isAppend) {
        handleInIndex = contourPointIndex;
        anchorIndex = contourPointIndex + 1;
        handleOutIndex = contourPointIndex + 2;
        insertIndices = [handleInIndex, anchorIndex, handleOutIndex];
      } else {
        handleInIndex = 2;
        anchorIndex = 1;
        handleOutIndex = 0;
        insertIndices = [0, 0, 0];
      }

      const newPoints = [
        {...handleIn, "type": "cubic"},
        {...anchorPoint, "smooth": true},
        {...handleOut, "type": "cubic"},
      ];
      for (let i = 0; i < 3; i++) {
        rollbackChanges.push(deletePoint(contourIndex, insertIndices[i]));
        editChanges.push(insertPoint(contourIndex, insertIndices[i], newPoints[i]));
      }

      newSelection = new Set([`point/${contourStartPoint + handleOutIndex}`]);
      this.sceneController.selection = newSelection;

      await editContext.editSetRollback(consolidateChanges([...reversed(rollbackChanges)]));
      await editContext.editIncremental(consolidateChanges(editChanges));

      let moveChanges;
      for await (const event of eventStream) {
        let handleOut = this._getHandle(event, anchorPoint);
        handleIn = oppositeHandle(anchorPoint, handleOut);
        moveChanges = [
          movePoint(contourStartPoint + handleInIndex, handleIn.x, handleIn.y),
          movePoint(contourStartPoint + handleOutIndex, handleOut.x, handleOut.y),
        ];
        await editContext.editIncremental(consolidateChanges(moveChanges));
      }
      if (moveChanges) {
        editChanges.push(...moveChanges);
      }
    }

    const undoInfo = {
      "label": "draw point",
      "undoSelection": initialSelection,
      "redoSelection": newSelection,
      "location": this.sceneController.getLocation(),
    }

    await editContext.editEnd(consolidateChanges(editChanges), undoInfo);
  }

  _getHandle(event, anchorPoint) {
    let handleOut = this.sceneController.selectedGlyphPoint(event);
    if (event.shiftKey) {
      handleOut = shiftConstrain(anchorPoint, handleOut);
    }
    return roundPoint(handleOut);
  }

}


function getAppendIndices(selection, path) {
  if (selection.size === 1) {
    const sel = [...selection][0];
    const [tp, pointIndex] = sel.split("/");
    if (pointIndex < path.numPoints) {
      const [selContourIndex, selContourPointIndex] = path.getContourAndPointIndex(pointIndex);
      const numPointsContour = path.getNumPointsOfContour(selContourIndex);
      if (
        !path.contourInfo[selContourIndex].isClosed
        && (selContourPointIndex === 0 || selContourPointIndex === numPointsContour - 1)
      ) {
        // Let's append or prepend a point to an existing contour
        const contourIndex = selContourIndex;
        const isAppend = !!(selContourPointIndex || numPointsContour === 1);
        const contourPointIndex = isAppend ? selContourPointIndex + 1 : 0;
        return [contourIndex, contourPointIndex, isAppend];
      }
    }
  }
  return [undefined, undefined, true];
}


function deleteContour(contourIndex) {
  return {
    "p": ["path"],
    "f": "deleteContour",
    "a": [contourIndex],
  };
}

function appendEmptyContour(contourIndex) {
  return {
    "p": ["path"],
    "f": "insertContour",
    "a": [contourIndex, emptyContour()],
  };
}

function deletePoint(contourIndex, contourPointIndex) {
  return {
    "p": ["path"],
    "f": "deletePoint",
    "a": [contourIndex, contourPointIndex],
  };
}

function insertPoint(contourIndex, contourPointIndex, point) {
  return {
    "p": ["path"],
    "f": "insertPoint",
    "a": [contourIndex, contourPointIndex, point],
  };
}

function movePoint(pointIndex, x, y) {
  return {
    "p": ["path"],
    "f": "=xy",
    "a": [pointIndex, x, y],
  };
}

function emptyContour() {
  return {"coordinates": [], "pointTypes": [], "isClosed": false};
}


function oppositeHandle(anchorPoint, handlePoint) {
  return vector.addVectors(
    anchorPoint, vector.mulVector(vector.subVectors(handlePoint, anchorPoint), -1)
  );
}


function shiftConstrain(anchor, handle) {
  const delta = constrainHorVerDiag(vector.subVectors(handle, anchor));
  return vector.addVectors(anchor, delta);
}
