import { roundPoint } from "../core/utils.js";
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

    const selection = this.sceneController.selection;
    let contourIndex, contourPointIndex;

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
          contourIndex = selContourIndex;
          const isAppend = !!(selContourPointIndex || numPointsContour === 1);
          contourPointIndex = isAppend ? selContourPointIndex + 1 : 0;
        }
      }
    }

    if (contourIndex === undefined) {
      // Let's add a new contour
      contourIndex = path.numContours;
      contourPointIndex = 0;

      rollbackChanges.push({
        "p": ["path"],
        "f": "deleteContour",
        "a": [contourIndex],
      });

      editChanges.push({
        "p": ["path"],
        "f": "insertContour",
        "a": [contourIndex, emptyContour()],
      });
    }

    let newPointIndex;
    if (contourIndex >= path.numContours) {
      newPointIndex = path.numPoints;
    } else {
      newPointIndex = path.getAbsolutePointIndex(contourIndex, contourPointIndex, true);
    }
    const newSelection = new Set([`point/${newPointIndex}`]);

    rollbackChanges.push({
      "p": ["path"],
      "f": "deletePoint",
      "a": [contourIndex, contourPointIndex],
    });

    editChanges.push({
      "p": ["path"],
      "f": "insertPoint",
      "a": [contourIndex, contourPointIndex, glyphPoint],
    });

    const undoInfo = {
      "label": "draw point",
      "undoSelection": selection,
      "redoSelection": newSelection,
      "location": this.sceneController.getLocation(),
    }
    this.sceneController.selection = newSelection;

    if (await shouldInitiateDrag(eventStream, initialEvent)) {
      // console.log("Now drag a new off-curve point");
    }

    const editChange = consolidateChanges(editChanges);
    const rollbackChange = consolidateChanges([...rollbackChanges].reverse());

    // await editContext.editBegin();
    // await editContext.editSetRollback(rollbackChange);
    // await editContext.editIncremental(editChange);
    // await editContext.editEnd(editChange, undoInfo);
    await editContext.editAtomic(editChange, rollbackChange, undoInfo);

  }

}


function emptyContour() {
  return {"coordinates": [], "pointTypes": [], "isClosed": false};
}
