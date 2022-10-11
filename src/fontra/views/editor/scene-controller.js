import { MouseTracker } from "../core/mouse-tracker.js";
import { lenientIsEqualSet, isEqualSet } from "../core/set-ops.js";
import { arrowKeyDeltas, hasShortcutModifierKey } from "../core/utils.js";
import { EditBehaviorFactory } from "./edit-behavior.js";


export class SceneController {

  constructor(sceneModel, canvasController) {
    this.sceneModel = sceneModel;
    this.canvasController = canvasController;

    this.mouseTracker = new MouseTracker({
      drag: async (eventStream, initialEvent) => await this.handleDrag(eventStream, initialEvent),
      hover: event => this.handleHover(event),
      element: canvasController.canvas,
    });
    this._eventElement = document.createElement("div");

    this.sceneModel.fontController.addEditListener(async (...args) => await this.editListenerCallback(...args));
    this.canvasController.canvas.addEventListener("keydown", event => this.handleKeyDown(event));
    this.selectedTool = undefined;
  }

  async editListenerCallback(editMethodName, senderID, ...args) {
    // console.log(editMethodName, senderID, ...args);
    switch (editMethodName) {
      case "editBegin":
        {
          const glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
          this.sceneModel.ghostPath = glyphController.flattenedPath2d;
        }
        break;
      case "editEnd":
        delete this.sceneModel.ghostPath;
      case "editIncremental":
      case "editAtomic":
        await this.sceneModel.updateScene();
        this.canvasController.setNeedsUpdate();
        break;
    }
  }

  setSelectedTool(tool) {
    this.selectedTool = tool;
  }

  handleKeyDown(event) {
    if (!hasShortcutModifierKey(event) && event.key in arrowKeyDeltas) {
      this.handleArrowKeys(event);
      event.preventDefault();
      return;
    }
  }

  async handleArrowKeys(event) {
    if (!this.sceneModel.selectedGlyphIsEditing || !this.selection.size) {
      return;
    }
    const undoInfo = {
      "label": "nudge selection",
      "undoSelection": this.selection,
      "redoSelection": this.selection,
      "location": this.getLocation(),
    }
    const editContext = await this.getGlyphEditContext(this);
    if (!editContext) {
      return;
    }
    let [dx, dy] = arrowKeyDeltas[event.key];
    if (event.shiftKey) {
      dx *= 10;
      dy *= 10;
    }
    const behaviorFactory = new EditBehaviorFactory(editContext.instance, this.selection);
    const editBehavior = behaviorFactory.getBehavior(event.altKey ? "alternate" : "default");
    const delta = {"x": dx, "y": dy};
    const editChange = editBehavior.makeChangeForDelta(delta)
    await editContext.editAtomic(editChange, editBehavior.rollbackChange, undoInfo);
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
    if (this.selectedTool) {
      await this.selectedTool.handleDrag(eventStream, initialEvent);
    }
  }

  handleHover(event) {
    if (this.selectedTool) {
      this.selectedTool.handleHover(event);
    }
  }

  localPoint(event) {
    if (event.x !== undefined) {
      this._currentLocalPoint = this.canvasController.localPoint(event);
    }
    return this._currentLocalPoint;
  }

  selectedGlyphPoint(event) {
    // Return the event location in the selected-glyph coordinate system
    const canvasPoint = this.localPoint(event);
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (positionedGlyph === undefined) {
      return undefined;
    }
    return {
      "x": canvasPoint.x - positionedGlyph.x,
      "y": canvasPoint.y - positionedGlyph.y,
    }
  }

  get onePixelUnit() {
    return this.canvasController.onePixelUnit;
  }

  get mouseClickMargin() {
    return this.onePixelUnit * 10;
  }

  get selection() {
    return this.sceneModel.selection;
  }

  set selection(selection) {
    if (!lenientIsEqualSet(selection, this.selection)) {
      this.sceneModel.selection = selection || new Set();
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
    await this.sceneModel.setGlyphLines(glyphLines);
    this.canvasController.setNeedsUpdate();
  }

  getLocation() {
    return this.sceneModel.getLocation();
  }

  getGlobalLocation() {
    return this.sceneModel.getGlobalLocation();
  }

  getLocalLocations(filterShownGlyphs = false) {
    return this.sceneModel.getLocalLocations(filterShownGlyphs);
  }

  async setLocation(values) {
    await this.sceneModel.setLocation(values);
    this.canvasController.setNeedsUpdate();
  }

  async setGlobalAndLocalLocations(globalLocation, localLocations) {
    await this.sceneModel.setGlobalAndLocalLocations(globalLocation, localLocations);
    this.canvasController.setNeedsUpdate();
  }

  updateLocalLocations(localLocations) {
    this.sceneModel.updateLocalLocations(localLocations);
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

  async getGlyphEditContext(senderID) {
    const glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
    if (!glyphController.canEdit) {
      console.log(`can't edit glyph '${this.getSelectedGlyphName()}': location is not a source`);
      // TODO: dialog with options:
      // - go to closest source
      // - insert new source here
      // - cancel
      return null;
    }
    return await this.sceneModel.fontController.getGlyphEditContext(glyphController, senderID || this);
  }

  getSelectionBox() {
    return this.sceneModel.getSelectionBox();
  }

  getUndoRedoInfo(isRedo) {
    const glyphName = this.getSelectedGlyphName();
    if (glyphName === undefined) {
      return;
    }
    return this.sceneModel.fontController.getUndoRedoInfo(glyphName, isRedo);
  }

  async doUndoRedo(isRedo) {
    const glyphName = this.getSelectedGlyphName();
    if (glyphName === undefined) {
      return;
    }
    const undoInfo = await this.sceneModel.fontController.undoRedoGlyph(glyphName, isRedo);
    if (undoInfo !== undefined) {
      this.selection = undoInfo.undoSelection;
      if (undoInfo.location) {
        await this.setLocation(undoInfo.location);
      }
      await this.sceneModel.updateScene();
      this.canvasController.setNeedsUpdate();
    }
    return undoInfo !== undefined;
  }

}
