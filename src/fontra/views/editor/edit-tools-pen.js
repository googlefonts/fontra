import { reversed, roundPoint } from "../core/utils.js";
import { consolidateChanges } from "../core/changes.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";


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
    const glyphPoint = roundPoint(this.sceneController.selectedGlyphPoint(initialEvent));
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

    let newPointIndex;
    if (contourIndex >= path.numContours) {
      newPointIndex = path.numPoints;
    } else {
      newPointIndex = path.getAbsolutePointIndex(contourIndex, contourPointIndex, true);
    }
    let newSelection = new Set([`point/${newPointIndex}`]);

    rollbackChanges.push(deletePoint(contourIndex, contourPointIndex));
    editChanges.push(insertPoint(contourIndex, contourPointIndex, glyphPoint));

    this.sceneController.selection = newSelection;

    await editContext.editBegin();
    await editContext.editSetRollback(consolidateChanges([...reversed(rollbackChanges)]));
    await editContext.editIncremental(consolidateChanges(editChanges));

    const event = await shouldInitiateDrag(eventStream, initialEvent)
    if (event) {
      // Drag a new off-curve point
      if (isAppend) {
        newPointIndex += 1;
        contourPointIndex += 1;
        newSelection = new Set([`point/${newPointIndex}`]);
        this.sceneController.selection = newSelection;
      }
      const glyphPoint = roundPoint(this.sceneController.selectedGlyphPoint(event));

      rollbackChanges.push(deletePoint(contourIndex, contourPointIndex));
      editChanges.push(insertPoint(contourIndex, contourPointIndex, {...glyphPoint, "type": "quad"}));

      await editContext.editSetRollback(consolidateChanges([...reversed(rollbackChanges)]));
      await editContext.editIncremental(consolidateChanges(editChanges));

      let moveChange;
      for await (const event of eventStream) {
        const glyphPoint = roundPoint(this.sceneController.selectedGlyphPoint(event));
        moveChange = movePoint(newPointIndex, glyphPoint.x, glyphPoint.y);
        await editContext.editIncremental(moveChange);
      }
      if (moveChange) {
        editChanges.push(moveChange);
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
