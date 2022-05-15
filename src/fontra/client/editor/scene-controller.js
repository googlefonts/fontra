import { applyChange, consolidateChanges } from "../core/changes.js";
import { glyphChangeFunctions } from "../core/font-controller.js";
import { MouseTracker } from "../core/mouse-tracker.js";
import { centeredRect, normalizeRect } from "../core/rectangle.js";
import { lenientIsEqualSet, isEqualSet, isSuperset, union, symmetricDifference } from "../core/set-ops.js";
import { EditBehavior } from "./edit-behavior.js";


export class SceneController {

  constructor(sceneModel, canvasController) {
    this.sceneModel = sceneModel;
    this.canvasController = canvasController;

    this.mouseTracker = new MouseTracker({
      drag: async (eventStream, initialEvent) => this.handleDrag(eventStream, initialEvent),
      hover: event => this.handleHover(event),
      element: canvasController.canvas,
    });
    this._eventElement = document.createElement("div");
  }

  addEventListener(eventName, handler, options) {
    this._eventElement.addEventListener(eventName, handler, options);
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      "bubbles": false,
      "detail": detail || this,
    });
    this._eventElement.dispatchEvent(event);
  }

  getSelectedGlyphName() {
    return this.sceneModel.getSelectedGlyphName();
  }

  getSelectedGlyphState() {
    return this.sceneModel.getSelectedGlyphState();
  }

  setSelectedGlyphState(state) {
    this.sceneModel.setSelectedGlyphState(state);
    this.canvasController.setNeedsUpdate();
  }

  async handleDrag(eventStream, initialEvent) {
    const point = this.localPoint(initialEvent);
    const selection = this.sceneModel.selectionAtPoint(point, this.mouseClickMargin);
    if (initialEvent.detail >= 2 || initialEvent.myTapCount >= 2) {
      this.handleDoubleCick(selection, point);
      initialEvent.preventDefault();  // don't let our dbl click propagate to other elements
      return;
    }

    if (!this.sceneModel.selectedGlyphIsEditing) {
      this.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      this.selectedGlyphIsEditing = false;
      return;
    }

    const initialSelection = this.selection;
    let initiateDrag = false;
    let initiateRectSelect = false;

    if (selection.size > 0) {
      if (event.shiftKey) {
        this.selection = symmetricDifference(this.selection, selection);
        if (isSuperset(this.selection, selection)) {
          initiateDrag = true;
        }
      } else if (isSuperset(this.selection, selection)) {
        initiateDrag = true;
      } else {
        this.selection = selection;
        initiateDrag = true;
      }
    } else {
      if (!event.shiftKey) {
        this.selection = selection;
      }
      initiateRectSelect = true;
    }

    if (initiateRectSelect || initiateDrag) {
      if (!await shouldInitiateDrag(eventStream, initialEvent)) {
        initiateRectSelect = false;
        initiateDrag = false;
        const selectedGlyph = this.sceneModel.glyphAtPoint(point);
        if (selectedGlyph && selectedGlyph != this.selectedGlyph) {
          this.selectedGlyph = selectedGlyph;
          this.selectedGlyphIsEditing = false;
          return;
        }
      }
    }

    this.hoveredGlyph = undefined;

    if (initiateRectSelect) {
      return await this.handleRectSelect(eventStream, initialEvent, initialSelection);
    }
    if (initiateDrag) {
      return await this.handleDragSelection(eventStream, initialEvent);
    }
  }

  handleDoubleCick(selection, point) {
    if (!selection || !selection.size) {
      this.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      this.selectedGlyphIsEditing = !!this.selectedGlyph;
    } else {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
      const componentNames = new Set();
      for (const selItem of this.selection) {
        const [tp, index] = selItem.split("/");
        if (tp === "component") {
          componentNames.add(instance.components[index].name);
        }
      }
      if (componentNames.size) {
        this.doubleClickedComponentNames = Array.from(componentNames);
        this._dispatchEvent("doubleClickedComponents");
      }
    }
  }

  async handleRectSelect(eventStream, initialEvent, initialSelection) {
    const initialPoint = this.localPoint(initialEvent);
    for await (const event of eventStream) {
      const currentPoint = this.localPoint(event);
      const selRect = normalizeRect({
        "xMin": initialPoint.x,
        "yMin": initialPoint.y,
        "xMax": currentPoint.x,
        "yMax": currentPoint.y,
      });
      const selection = this.sceneModel.selectionAtRect(selRect);
      this.selectionRect = selRect;

      if (event.shiftKey) {
        this.selection = symmetricDifference(initialSelection, selection);
      } else {
        this.selection = selection;
      }
    }
    this.selectionRect = undefined;
  }

  async handleDragSelection(eventStream, initialEvent) {
    const initialPoint = this.localPoint(initialEvent);

    const editContext = this.getGlyphEditContext();
    if (!editContext) {
      console.log(`can't edit glyph '${glyphController.name}': location is not a source`);
      // TODO: dialog with options:
      // - go to closest source
      // - insert new source here
      // - cancel
      return;
    }

    const editor = new EditBehavior(editContext.instance, this.selection);

    await editContext.beginEdit(editor.rollbackChange);

    for await (const event of eventStream) {
      const currentPoint = this.localPoint(event);
      const delta = {"x": currentPoint.x - initialPoint.x, "y": currentPoint.y - initialPoint.y};
      await editContext.doEdit(editor.makeChangeForDelta(delta));
    }

    await editContext.endEdit();
  }

  handleHover(event) {
    const point = this.localPoint(event);
    const size = this.mouseClickMargin;
    const selRect = centeredRect(point.x, point.y, size);
    this.hoverSelection = this.sceneModel.selectionAtPoint(point, size);
    this.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
    if (this.hoverSelection?.size) {
      this.canvasController.canvas.style.cursor = "pointer";
    } else {
      this.canvasController.canvas.style.cursor = "default";
    }
  }

  localPoint(event) {
    if (event.x !== undefined) {
      this._currentLocalPoint = this.canvasController.localPoint(event);
    }
    return this._currentLocalPoint;
  }

  get onePixelUnit() {
    return this.canvasController.onePixelUnit;
  }

  get mouseClickMargin() {
    return this.canvasController.drawingParameters.cornerNodeSize;
  }

  get selection() {
    return this.sceneModel.selection;
  }

  set selection(selection) {
    if (!lenientIsEqualSet(selection, this.selection)) {
      this.sceneModel.selection = selection;
      this.canvasController.setNeedsUpdate();
      this._dispatchEvent("selectionChanged");
    }
  }

  get hoverSelection() {
    return this.sceneModel.hoverSelection;
  }

  set hoverSelection(selection) {
    if (!lenientIsEqualSet(selection, this.hoverSelection)) {
      this.sceneModel.hoverSelection = selection;
      this.canvasController.setNeedsUpdate();
    }
  }

  get hoveredGlyph() {
    return this.sceneModel.hoveredGlyph;
  }

  set hoveredGlyph(hoveredGlyph) {
    if (this.sceneModel.hoveredGlyph != hoveredGlyph) {
      this.sceneModel.hoveredGlyph = hoveredGlyph;
      this.canvasController.setNeedsUpdate();
    }
  }

  get selectedGlyph() {
    return this.sceneModel.selectedGlyph;
  }

  set selectedGlyph(selectedGlyph) {
    if (this.sceneModel.selectedGlyph != selectedGlyph) {
      this.sceneModel.selectedGlyph = selectedGlyph;
      this.sceneModel.selection = new Set();
      this.canvasController.setNeedsUpdate();
      this._dispatchEvent("selectedGlyphChanged");
    }
  }

  get selectedGlyphIsEditing() {
    return this.sceneModel.selectedGlyphIsEditing;
  }

  set selectedGlyphIsEditing(flag) {
    if (this.sceneModel.selectedGlyphIsEditing != flag) {
      this.sceneModel.selectedGlyphIsEditing = flag;
      this.canvasController.setNeedsUpdate();
      this._dispatchEvent("selectedGlyphIsEditingChanged");
    }
  }

  get selectionRect() {
    return this.sceneModel.selectionRect;
  }

  set selectionRect(selRect) {
    this.sceneModel.selectionRect = selRect;
    this.canvasController.setNeedsUpdate();
  }

  getGlyphLines() {
    return this.sceneModel.getGlyphLines();
  }

  async setGlyphLines(glyphLines) {
    const startTime = new Date();
    let updating = false;
    for await (const _ of this.sceneModel.setGlyphLines(glyphLines, true)) {
      if (!updating) {
        const currentTime = new Date();
        if (currentTime - startTime > 200) {
          updating = true;
        }
      }
      if (updating) {
        this.canvasController.setNeedsUpdate();
      }
    }
    this.canvasController.setNeedsUpdate();
  }

  getLocation() {
    return this.sceneModel.getLocation();
  }

  async setLocation(values) {
    await this.sceneModel.setLocation(values);
    this.canvasController.setNeedsUpdate();
  }

  getSelectedSource() {
    return this.sceneModel.getSelectedSource();
  }

  async setSelectedSource(sourceIndex) {
    await this.sceneModel.setSelectedSource(sourceIndex);
    this.canvasController.setNeedsUpdate();
  }

  getAxisInfo() {
    return this.sceneModel.getAxisInfo();
  }

  getSourcesInfo() {
    return this.sceneModel.getSourcesInfo();
  }

  getSceneBounds() {
    return this.sceneModel.getSceneBounds();
  }

  getGlyphEditContext() {
    const glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
    if (!glyphController.canEdit) {
      return null;
    }
    return new GlyphEditContext(this, glyphController);
  }

}


const MINIMUM_DRAG_DISTANCE = 2;


async function shouldInitiateDrag(eventStream, initialEvent) {
  // drop events until the pointer moved a minimal distance
  const initialX = initialEvent.pageX;
  const initialY = initialEvent.pageY;

  for await (const event of eventStream) {
    const x = event.pageX;
    const y = event.pageY;
    if (
      Math.abs(initialX - x) > MINIMUM_DRAG_DISTANCE ||
      Math.abs(initialY - y) > MINIMUM_DRAG_DISTANCE
    ) {
      return true;
    }
  }
  return false;
}


class GlyphEditContext {

  constructor(sceneController, glyphController) {
    this.sceneController = sceneController;
    this.sceneModel = sceneController.sceneModel;
    this.canvasController = sceneController.canvasController
    this.fontController = this.sceneModel.fontController;
    this.glyphController = glyphController;
    this.instance = glyphController.instance;
    this.glyphName = glyphController.name;
  }

  async beginEdit(rollbackChange) {
    this.rollbackChange = rollbackChange;
    const varGlyph = await this.fontController.getGlyph(this.glyphName);
    const layerIndex = varGlyph.getLayerIndex(varGlyph.sources[this.glyphController.sourceIndex].layerName);
    this.baseChangePath = ["glyphs", this.glyphName, "layers", layerIndex, "glyph"];

    await this.fontController.changeBegin();
    await this.fontController.changeSetRollback(consolidateChanges(rollbackChange, this.baseChangePath));
    this.sceneModel.ghostPath = this.glyphController.flattenedPath2d;
  }

  async doEdit(change) {
    this.absChange = consolidateChanges(change, this.baseChangePath);
    await this.fontController.changeChanging(this.absChange);
    applyChange(this.instance, change, glyphChangeFunctions);
    await this.fontController.glyphChanged(this.glyphName);
    await this.sceneModel.updateScene();
    this.canvasController.setNeedsUpdate();
  }

  async endEdit() {
    delete this.sceneModel.ghostPath;
    const error = await this.fontController.changeEnd(this.absChange);
    if (error) {
      applyChange(this.instance, this.rollbackChange, glyphChangeFunctions);
      await this.fontController.glyphChanged(this.glyphName);
      await this.sceneModel.updateScene();
      this.canvasController.setNeedsUpdate();
    }
  }

}
