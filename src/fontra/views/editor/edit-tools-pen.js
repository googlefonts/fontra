import { ChangeCollector, applyChange, consolidateChanges } from "../core/changes.js";
import { recordChanges } from "../core/change-recorder.js";
import { isEqualSet } from "../core/set-ops.js";
import { reversed } from "../core/utils.js";
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

    this.sceneController.editInstance(async (sendIncrementalChange, instance) => {
      const initialSelection = this.sceneController.selection;

      const behavior = getPenToolBehavior(this.sceneController, initialEvent, instance);

      const initialChanges = recordChanges(instance, instanceProxy => {
        behavior.setupContour(instanceProxy);
        behavior.initialPointChange(instanceProxy);
      });
      this.sceneController.selection = behavior.selection;
      await sendIncrementalChange(initialChanges);
      let preDragChanges = new ChangeCollector();
      let dragChanges = new ChangeCollector();

      if (await shouldInitiateDrag(eventStream, initialEvent)) {
        preDragChanges = recordChanges(instance, instanceProxy => {
          behavior.setupDrag(instanceProxy);
        });
        this.sceneController.selection = behavior.selection;
        await sendIncrementalChange(preDragChanges);
        for await (const event of eventStream) {
          dragChanges = recordChanges(instance, instanceProxy => {
            behavior.drag(instanceProxy, event);
          });
          await sendIncrementalChange(dragChanges, true);  // true: "may drop"
        }
        await sendIncrementalChange(dragChanges);
      }

      const finalChange = initialChanges.concat(preDragChanges, dragChanges);

      const undoInfo = {
        "label": behavior.undoLabel,
        "undoSelection": initialSelection,
        "redoSelection": this.sceneController.selection,
        "location": this.sceneController.getLocation(),
      }
      return {"change": finalChange, "undoInfo": undoInfo};
    });

  }

}


function getPenToolBehavior(sceneController, initialEvent, instance) {
  const behavior = new DummyBehavior();
  return behavior;
}


class DummyBehavior {

  undoLabel = "add point(s)"

  constructor() {
    this.selection = new Set();
  }

  setupContour(instance) {
    console.log("setupContour", instance);
  }

  initialPointChange(instance) {
    console.log("initialPointChange", instance);
  }

  setupDrag(instance) {
    console.log("setupDrag", instance);
  }

  drag(instance, event) {
    console.log("drag", instance, event);
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


function emptyContour() {
  return {"coordinates": [], "pointTypes": [], "isClosed": false};
}


function getHandle(handleOut, anchorPoint, constrain) {
  if (constrain) {
    handleOut = shiftConstrain(anchorPoint, handleOut);
  }
  return vector.roundVector(handleOut);
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
