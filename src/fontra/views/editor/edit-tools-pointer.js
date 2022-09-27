import { centeredRect, normalizeRect } from "../core/rectangle.js";
import { isSuperset, symmetricDifference } from "../core/set-ops.js";
import { boolInt } from "../core/utils.js";
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
      this.handleDoubleCick(selection, point);
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

  handleDoubleCick(selection, point) {
    const sceneController = this.sceneController;
    if (!selection || !selection.size) {
      sceneController.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      sceneController.selectedGlyphIsEditing = !!sceneController.selectedGlyph;
    } else {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
      const componentIndices = new Array();
      for (const selItem of sceneController.selection) {
        const [tp, index] = selItem.split("/");
        if (tp === "component") {
          componentIndices.push(index);
        }
      }
      if (componentIndices.length) {
        componentIndices.sort();
        sceneController.doubleClickedComponentIndices = componentIndices;
        sceneController._dispatchEvent("doubleClickedComponents");
      }
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

    await editContext.editBegin();
    await editContext.editSetRollback(editBehavior.rollbackChange);
    let editChange;

    for await (const event of eventStream) {
      const newEditBehaviorName = getBehaviorName(event);
      if (behaviorName !== newEditBehaviorName) {
        behaviorName = newEditBehaviorName;
        editBehavior = behaviorFactory.getBehavior(behaviorName);
        await editContext.editSetRollback(editBehavior.rollbackChange);
      }
      const currentPoint = sceneController.localPoint(event);
      const delta = {"x": currentPoint.x - initialPoint.x, "y": currentPoint.y - initialPoint.y};
      editChange = editBehavior.makeChangeForDelta(delta)
      await editContext.editIncrementalMayDrop(editChange);
    }
    await editContext.editIncremental(editChange);
    await editContext.editEnd(editChange, undoInfo);
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
