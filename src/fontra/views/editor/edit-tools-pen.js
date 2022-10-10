import { consolidateChanges } from "../core/changes.js";
import { isEqualSet } from "../core/set-ops.js";
import { reversed, roundPoint } from "../core/utils.js";
import { VarPackedPath } from "../core/var-path.js";
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
    const editContext = await this.sceneController.getGlyphEditContext(this);
    if (!editContext) {
      return;
    }

    const initialSelection = this.sceneController.selection;

    const behavior = getPenToolBehavior(
      this.sceneController,
      initialEvent,
      editContext.glyphController.instance.path,
    );

    if (!behavior) {
      return;
    }

    let didEdit = false;

    if (behavior.wantInitialChange) {
      this.sceneController.selection = behavior.getSelection();
      await editContext.editBegin();
      didEdit = true;
      await editContext.editSetRollback(behavior.getRollbackChange());
      await editContext.editIncremental(behavior.getInitialChange());
    }

    if (behavior.wantDrag && await shouldInitiateDrag(eventStream, initialEvent)) {
      behavior.startDragging();
      this.sceneController.selection = behavior.getSelection();
      if (!behavior.wantInitialChange) {
        await editContext.editBegin();
        didEdit = true;
      }
      await editContext.editSetRollback(behavior.getRollbackChange());
      await editContext.editIncremental(behavior.getInitialChange());

      let moveChange;
      for await (const event of eventStream) {
        const point = this.sceneController.selectedGlyphPoint(event);
        moveChange = behavior.getIncrementalChange(point, event.shiftKey);
        await editContext.editIncrementalMayDrop(moveChange);
      }
      if (moveChange) {
        await editContext.editIncremental(moveChange);
      }
    }

    if (didEdit) {
      const undoInfo = {
        "label": behavior.undoLabel,
        "undoSelection": initialSelection,
        "redoSelection": this.sceneController.selection,
        "location": this.sceneController.getLocation(),
      }
      await editContext.editEnd(behavior.getFinalChange(), undoInfo);
    }
  }

}


function getPenToolBehavior(sceneController, initialEvent, path) {
  const anchorPoint = roundPoint(sceneController.selectedGlyphPoint(initialEvent));

  let [contourIndex, contourPointIndex, shouldAppend, isOnCurve] = getAppendIndices(path, sceneController.selection);
  let behaviorClass = isOnCurve ? AddPointsSingleHandleBehavior : AddPointsBehavior;

  if (contourIndex !== undefined) {
    const clickedSelection = sceneController.sceneModel.selectionAtPoint(
      sceneController.localPoint(initialEvent), sceneController.mouseClickMargin
    );
    if (isEqualSet(clickedSelection, sceneController.selection)) {
      if (shouldAppend) {
        contourPointIndex--;
      }
      const point = path.getContourPoint(contourIndex, contourPointIndex);
      if (point.type) {
        // off-curve
        if (path.getNumPointsOfContour(contourIndex) < 2) {
          // Contour is a single off-curve point, let's not touch it
          return null;
        }
        return new DeleteHandleBehavior(path, contourIndex, contourPointIndex, shouldAppend);
      } else {
        // on-curve
        behaviorClass = AddHandleBehavior;
      }
    }

  } else {
    // Let's add a new contour
    behaviorClass = AddContourAndPointsBehavior;
    contourIndex = path.numContours;
    contourPointIndex = 0;
  }
  return new behaviorClass(path, contourIndex, contourPointIndex, shouldAppend, anchorPoint);
}


class DeleteHandleBehavior {

  wantDrag = false;
  wantInitialChange = true;
  undoLabel = "delete handle";

  constructor(path, contourIndex, contourPointIndex, shouldAppend) {
    const pointIndex = path.getAbsolutePointIndex(contourIndex, contourPointIndex);
    const currentAnchorIndex = shouldAppend ? pointIndex - 1 : pointIndex + 1;
    const point = path.getPoint(pointIndex);
    this._rollbackChanges = [
      setPointType(currentAnchorIndex, path.pointTypes[currentAnchorIndex]),
      insertPoint(contourIndex, contourPointIndex, point),
    ];
    this._editChanges = [
      setPointType(currentAnchorIndex, VarPackedPath.ON_CURVE),
      deletePoint(contourIndex, contourPointIndex),
    ];
    const newSelectedPointIndex = shouldAppend ? pointIndex - 1 : pointIndex;
    this._newSelection = new Set([`point/${newSelectedPointIndex}`]);
  }

  getSelection() {
    return this._newSelection;
  }

  getRollbackChange() {
    return consolidateChanges([...reversed(this._rollbackChanges)]);
  }

  getInitialChange() {
    return consolidateChanges(this._editChanges);
  }

  getFinalChange() {
    return consolidateChanges(this._editChanges);
  }

}

class AddPointsBehavior {

  wantDrag = true;
  wantInitialChange = true;
  undoLabel = "add point";

  constructor(path, contourIndex, contourPointIndex, shouldAppend, anchorPoint) {
    this.contourIndex = contourIndex;
    this.contourPointIndex = contourPointIndex;
    this.shouldAppend = shouldAppend;
    this.anchorPoint = anchorPoint;
    this.curveType = "cubic";

    this._rollbackChanges = [];
    this._editChanges = [];
    this._moveChanges = [];

    this._setupContourChanges(contourIndex);

    this.contourStartPoint = (
      contourIndex >= path.numContours ?
      path.numPoints : path.getAbsolutePointIndex(contourIndex, 0, true)
    );

    this._setupInitialChanges(contourIndex, contourPointIndex, anchorPoint);
  }

  _setupInitialChanges(contourIndex, contourPointIndex, anchorPoint) {
    this._newSelection = new Set([`point/${this.contourStartPoint + contourPointIndex}`]);
    this._rollbackChanges.push(deletePoint(contourIndex, contourPointIndex));
    this._editChanges.push(insertPoint(contourIndex, contourPointIndex, anchorPoint));
  }

  _setupContourChanges(contourIndex) {
    // Nothing to do
  }

  startDragging() {
    // Let's start over, revert the last insertPoint
    this._rollbackChanges.splice(-1);
    this._editChanges.splice(-1);

    const [handleInIndex, handleOutIndex, insertIndices, newPoints] = this._getIndicesAndPoints();
    this.handleInIndex = handleInIndex;
    this.handleOutIndex = handleOutIndex;

    for (let i = 0; i < insertIndices.length; i++) {
      this._rollbackChanges.push(deletePoint(this.contourIndex, insertIndices[i]));
      this._editChanges.push(insertPoint(this.contourIndex, insertIndices[i], newPoints[i]));
    }

    this._newSelection = new Set([`point/${this.contourStartPoint + this.handleOutIndex}`]);
  }

  _getIndicesAndPoints() {
    let handleInIndex, handleOutIndex, insertIndices;
    if (this.shouldAppend) {
      handleInIndex = this.contourPointIndex;
      const anchorIndex = this.contourPointIndex + 1;
      handleOutIndex = this.contourPointIndex + 2;
      insertIndices = [handleInIndex, anchorIndex, handleOutIndex];
    } else {
      handleInIndex = 2;
      handleOutIndex = 0;
      insertIndices = [0, 0, 0];
    }
    const newPoints = [
      {...this.anchorPoint, "type": this.curveType},
      {...this.anchorPoint, "smooth": true},
      {...this.anchorPoint, "type": this.curveType},
    ];
    return [handleInIndex, handleOutIndex, insertIndices, newPoints];
  }

  getSelection() {
    return this._newSelection;
  }

  getRollbackChange() {
    return consolidateChanges([...reversed(this._rollbackChanges)]);
  }

  getInitialChange() {
    return consolidateChanges(this._editChanges);
  }

  getIncrementalChange(point, constrain) {
    const handleOut = getHandle(point, this.anchorPoint, constrain);
    this._moveChanges = [
      movePoint(this.contourStartPoint + this.handleOutIndex, handleOut.x, handleOut.y)
    ];
    if (this.handleInIndex !== undefined) {
      const handleIn = oppositeHandle(this.anchorPoint, handleOut);
      this._moveChanges.push(
        movePoint(this.contourStartPoint + this.handleInIndex, handleIn.x, handleIn.y)
      );
    }
    return consolidateChanges(this._moveChanges);
  }

  getFinalChange() {
    return consolidateChanges(this._editChanges.concat(this._moveChanges));
  }

}


class AddPointsSingleHandleBehavior extends AddPointsBehavior {

  _getIndicesAndPoints() {
    let handleInIndex, handleOutIndex, insertIndices;
    if (this.shouldAppend) {
      handleInIndex = undefined;
      const anchorIndex = this.contourPointIndex;
      handleOutIndex = this.contourPointIndex + 1;
      insertIndices = [anchorIndex, handleOutIndex];
    } else {
      handleInIndex = undefined;
      handleOutIndex = 0;
      insertIndices = [0, 0];
    }
    const newPoints = [
      {...this.anchorPoint},
      {...this.anchorPoint, "type": this.curveType},
    ];
    return [handleInIndex, handleOutIndex, insertIndices, newPoints];
  }

}


class AddContourAndPointsBehavior extends AddPointsSingleHandleBehavior {

  _setupContourChanges(contourIndex) {
    this._rollbackChanges.push(deleteContour(contourIndex));
    this._editChanges.push(appendEmptyContour(contourIndex));
  }

}


class AddHandleBehavior extends AddPointsBehavior {

  wantInitialChange = false;
  undoLabel = "add handle";

  _setupInitialChanges(contourIndex, contourPointIndex, anchorPoint) {
    this._newSelection = new Set();
  }

  _getIndicesAndPoints() {
    let handleOutIndex, insertIndices;
    const handleInIndex = undefined;
    if (this.shouldAppend) {
      handleOutIndex = this.contourPointIndex + 1;
      insertIndices = [handleOutIndex];
    } else {
      handleOutIndex = 0;
      insertIndices = [0];
    }
    const newPoints = [
      {...this.anchorPoint, "type": this.curveType},
    ];
    return [handleInIndex, handleOutIndex, insertIndices, newPoints];
  }

}


function getAppendIndices(path, selection) {
  if (selection.size === 1) {
    const sel = [...selection][0];
    const [tp, pointIndex] = sel.split("/");
    if (pointIndex < path.numPoints) {
      const isOnCurve = !path.getPoint(pointIndex).type;
      const [selContourIndex, selContourPointIndex] = path.getContourAndPointIndex(pointIndex);
      const numPointsContour = path.getNumPointsOfContour(selContourIndex);
      if (
        !path.contourInfo[selContourIndex].isClosed
        && (selContourPointIndex === 0 || selContourPointIndex === numPointsContour - 1)
      ) {
        // Let's append or prepend a point to an existing contour
        const contourIndex = selContourIndex;
        const shouldAppend = !!(selContourPointIndex || numPointsContour === 1);
        const contourPointIndex = shouldAppend ? selContourPointIndex + 1 : 0;
        return [contourIndex, contourPointIndex, shouldAppend, isOnCurve];
      }
    }
  }
  return [undefined, undefined, true, undefined];
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

function setPointType(pointIndex, pointType) {
  return {
    "p": ["path", "pointTypes"],
    "f": "=",
    "a": [pointIndex, pointType],
  };
}


function emptyContour() {
  return {"coordinates": [], "pointTypes": [], "isClosed": false};
}


function getHandle(handleOut, anchorPoint, constrain) {
  if (constrain) {
    handleOut = shiftConstrain(anchorPoint, handleOut);
  }
  return roundPoint(handleOut);
}


function oppositeHandle(anchorPoint, handlePoint) {
  return vector.addVectors(
    anchorPoint, vector.mulVector(vector.subVectors(handlePoint, anchorPoint), -1)
  );
}

function shiftConstrain(anchorPoint, handlePoint) {
  const delta = constrainHorVerDiag(vector.subVectors(handlePoint, anchorPoint));
  return vector.addVectors(anchorPoint, delta);
}
