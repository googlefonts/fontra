import { roundPoint } from "../core/utils.js";
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

    const instance = editContext.glyphController.instance;
    const path = instance.path;

    const selection = this.sceneController.selection;
    let editChange, rollbackChange, newSelection;
    if (selection.size === 1) {
      const sel = [...selection][0];
      const [tp, pointIndex] = sel.split("/");
      if (pointIndex < path.numPoints) {
        const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
        const numPointsContour = path.getNumPointsOfContour(contourIndex);
        if (
          !path.contourInfo[contourIndex].isClosed
          && (contourPointIndex === 0 || contourPointIndex === numPointsContour - 1)
        ) {
          // Let's append or prepend a point
          const isAppend = !!(contourPointIndex || numPointsContour === 1);
          const newContourPointIndex = isAppend ? contourPointIndex + 1 : 0;
          const newPointIndex = path.getAbsolutePointIndex(contourIndex, newContourPointIndex, true);
          newSelection = new Set([`point/${newPointIndex}`]);
          rollbackChange = {
            "p": ["path"],
            "f": "deletePoint",
            "a": [contourIndex, newContourPointIndex],
          }
          editChange = {
            "p": ["path"],
            "f": "insertPoint",
            "a": [contourIndex, newContourPointIndex, glyphPoint],
          }
        }
      }
    }

    if (editChange === undefined) {
      // Let's add a new contour
      const newContourIndex = path.numContours;
      const newPointIndex = path.numPoints;
      newSelection = new Set([`point/${newPointIndex}`]);
      rollbackChange = {
        "p": ["path"],
        "f": "deleteContour",
        "a": [newContourIndex],
      }
      editChange = {
        "p": ["path"],
        "f": "insertContour",
        "a": [
          newContourIndex,
          {
            "coordinates": [glyphPoint.x, glyphPoint.y],
            "pointTypes": [0],
            "isClosed": false
          }
        ]
      }
    }

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

    // await editContext.editBegin();
    // await editContext.editSetRollback(rollbackChange);
    // await editContext.editIncremental(editChange);
    // await editContext.editEnd(editChange, undoInfo);
    await editContext.editAtomic(editChange, rollbackChange, undoInfo);

  }

}
