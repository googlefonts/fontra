import { ChangeCollector, applyChange, hasChange } from "../core/changes.js";
import { recordChanges } from "../core/change-recorder.js";
import { decomposeComponents } from "../core/glyph-controller.js";
import { MouseTracker } from "../core/mouse-tracker.js";
import { connectContours, splitPathAtPointIndices } from "../core/path-functions.js";
import { packContour } from "../core/var-path.js";
import { lenientIsEqualSet, isSuperset } from "../core/set-ops.js";
import {
  arrowKeyDeltas,
  hasShortcutModifierKey,
  parseSelection,
  reversed,
} from "../core/utils.js";
import { dialog } from "/web-components/dialog-overlay.js";
import { EditBehaviorFactory } from "./edit-behavior.js";

export class SceneController {
  constructor(sceneModel, canvasController) {
    this.sceneModel = sceneModel;
    this.canvasController = canvasController;

    this.mouseTracker = new MouseTracker({
      drag: async (eventStream, initialEvent) =>
        await this.handleDrag(eventStream, initialEvent),
      hover: (event) => this.handleHover(event),
      element: canvasController.canvas,
    });
    this._eventElement = document.createElement("div");

    this.sceneModel.fontController.addEditListener(
      async (...args) => await this.editListenerCallback(...args)
    );
    this.canvasController.canvas.addEventListener("keydown", (event) =>
      this.handleKeyDown(event)
    );
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
        break;
      case "editIncremental":
      case "editFinal":
        await this.sceneModel.updateScene();
        this.canvasController.requestUpdate();
        break;
    }
  }

  setSelectedTool(tool) {
    this.selectedTool?.deactivate();
    this.selectedTool = tool;
    this.hoverSelection = new Set();
    this.updateHoverState();
  }

  updateHoverState() {
    // Do this too soon and we'll risk stale hover info
    setTimeout(() => this.selectedTool.handleHover({}), 0);
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
    let [dx, dy] = arrowKeyDeltas[event.key];
    if (event.shiftKey) {
      dx *= 10;
      dy *= 10;
    }
    const delta = { x: dx, y: dy };
    await this.editInstance((sendIncrementalChange, instance) => {
      const behaviorFactory = new EditBehaviorFactory(instance, this.selection);
      const editBehavior = behaviorFactory.getBehavior(
        event.altKey ? "alternate" : "default"
      );
      const editChange = editBehavior.makeChangeForDelta(delta);
      applyChange(instance, editChange);

      let changes = ChangeCollector.fromChanges(
        editChange,
        editBehavior.rollbackChange
      );

      const connectDetector = this.getPathConnectDetector();
      if (connectDetector.shouldConnect()) {
        const connectChanges = recordChanges(instance, (instance) => {
          this.selection = connectContours(
            instance.path,
            connectDetector.connectSourcePointIndex,
            connectDetector.connectTargetPointIndex
          );
        });
        if (connectChanges.hasChange) {
          changes = changes.concat(connectChanges);
        }
      }

      return {
        changes: changes,
        undoLabel: "nudge selection",
        broadcast: true,
      };
    });
  }

  addEventListener(eventName, handler, options) {
    this._eventElement.addEventListener(eventName, handler, options);
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: detail || this,
    });
    this._eventElement.dispatchEvent(event);
  }

  updateContextMenuState(event) {
    this.contextMenuState = {};
    if (!this.selectedGlyphIsEditing) {
      return;
    }
    const clickedSelection = this.sceneModel.selectionAtPoint(
      this.localPoint(event),
      this.mouseClickMargin
    );
    let relevantSelection;
    if (!clickedSelection.size) {
      // Clicked on nothing, ignore selection
      relevantSelection = clickedSelection;
    } else {
      if (!isSuperset(this.selection, clickedSelection)) {
        // Clicked on something that wasn't yet selected; select it
        this.selection = clickedSelection;
      } else {
        // Use the existing selection as context
      }
      relevantSelection = this.selection;
    }
    const { point: pointSelection, component: componentSelection } =
      parseSelection(relevantSelection);
    this.contextMenuState.pointSelection = pointSelection;
    this.contextMenuState.componentSelection = componentSelection;
  }

  getContextMenuItems(event) {
    const contextMenuItems = [
      {
        title: "Break Contour",
        enabled: () => this.contextMenuState.pointSelection?.length,
        callback: () => this.breakContour(),
      },
      {
        title: "Reverse Contour Direction",
        enabled: () => this.contextMenuState.pointSelection?.length,
        callback: () => this.reverseSelectedContoursDirection(),
      },
      {
        title: "Set Start Point",
        enabled: () => this.contextMenuState.pointSelection?.length,
        callback: () => this.setStartPoint(),
      },
      {
        title: () =>
          "Decompose Component" +
          (this.contextMenuState.componentSelection?.length === 1 ? "" : "s"),
        enabled: () => this.contextMenuState.componentSelection?.length,
        callback: () => this.decomposeSelectedComponents(),
      },
    ];
    return contextMenuItems;
  }

  getSelectedGlyphName() {
    return this.sceneModel.getSelectedGlyphName();
  }

  getSelectedGlyphState() {
    return this.sceneModel.getSelectedGlyphState();
  }

  setSelectedGlyphState(state) {
    this.sceneModel.setSelectedGlyphState(state);
    this.canvasController.requestUpdate();
    this._dispatchEvent("selectedGlyphChanged");
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
    return this._currentLocalPoint || { x: 0, y: 0 };
  }

  selectedGlyphPoint(event) {
    // Return the event location in the selected-glyph coordinate system
    const canvasPoint = this.localPoint(event);
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (positionedGlyph === undefined) {
      return undefined;
    }
    return {
      x: canvasPoint.x - positionedGlyph.x,
      y: canvasPoint.y - positionedGlyph.y,
    };
  }

  get onePixelUnit() {
    return this.canvasController.onePixelUnit;
  }

  get mouseClickMargin() {
    return this.onePixelUnit * 12;
  }

  get selection() {
    return this.sceneModel.selection;
  }

  set selection(selection) {
    if (!lenientIsEqualSet(selection, this.selection)) {
      this.sceneModel.selection = selection || new Set();
      this.sceneModel.hoverSelection = new Set();
      this.canvasController.requestUpdate();
      // Delay the notification by a tiny amount, to work around
      // an ordering problem: sometimes the selection is set to
      // something that will be valid soon but isn't right now.
      setTimeout(() => this._dispatchEvent("selectionChanged"), 20);
    }
  }

  get hoverSelection() {
    return this.sceneModel.hoverSelection;
  }

  set hoverSelection(selection) {
    if (!lenientIsEqualSet(selection, this.hoverSelection)) {
      this.sceneModel.hoverSelection = selection;
      this.canvasController.requestUpdate();
    }
  }

  get hoveredGlyph() {
    return this.sceneModel.hoveredGlyph;
  }

  set hoveredGlyph(hoveredGlyph) {
    if (this.sceneModel.hoveredGlyph != hoveredGlyph) {
      this.sceneModel.hoveredGlyph = hoveredGlyph;
      this.canvasController.requestUpdate();
    }
  }

  get selectedGlyph() {
    return this.sceneModel.selectedGlyph;
  }

  set selectedGlyph(selectedGlyph) {
    if (this.sceneModel.selectedGlyph !== selectedGlyph) {
      this.sceneModel.selectedGlyph = selectedGlyph;
      this.sceneModel.selection = new Set();
      this.canvasController.requestUpdate();
      this._dispatchEvent("selectedGlyphChanged");
    }
  }

  get selectedGlyphIsEditing() {
    return this.sceneModel.selectedGlyphIsEditing;
  }

  set selectedGlyphIsEditing(flag) {
    if (this.sceneModel.selectedGlyphIsEditing != flag) {
      this.sceneModel.selectedGlyphIsEditing = flag;
      this.canvasController.requestUpdate();
      this._dispatchEvent("selectedGlyphIsEditingChanged");
    }
  }

  get selectionRect() {
    return this.sceneModel.selectionRect;
  }

  set selectionRect(selRect) {
    this.sceneModel.selectionRect = selRect;
    this.canvasController.requestUpdate();
  }

  getGlyphLines() {
    return this.sceneModel.getGlyphLines();
  }

  async setGlyphLines(glyphLines) {
    await this.sceneModel.setGlyphLines(glyphLines);
    this._dispatchEvent("selectedGlyphChanged");
    this.canvasController.requestUpdate();
  }

  async setTextAlignment(align) {
    await this.sceneModel.setTextAlignment(align);
    this.canvasController.requestUpdate();
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
    this.canvasController.requestUpdate();
  }

  async setGlobalAndLocalLocations(globalLocation, localLocations) {
    await this.sceneModel.setGlobalAndLocalLocations(globalLocation, localLocations);
    this.canvasController.requestUpdate();
  }

  updateLocalLocations(localLocations) {
    this.sceneModel.updateLocalLocations(localLocations);
  }

  getSceneBounds() {
    return this.sceneModel.getSceneBounds();
  }

  cancelEditing(reason) {
    if (this._glyphEditingDonePromise) {
      this._cancelGlyphEditing = reason;
    }
    return this._glyphEditingDonePromise;
  }

  async editGlyphAndRecordChanges(editFunc, senderID) {
    return await this._editGlyphOrInstanceAndRecordChanges(editFunc, senderID, false);
  }

  async editInstanceAndRecordChanges(editFunc, senderID) {
    return await this._editGlyphOrInstanceAndRecordChanges(editFunc, senderID, true);
  }

  async _editGlyphOrInstanceAndRecordChanges(editFunc, senderID, doInstance) {
    await this._editGlyphOrInstance(
      (sendIncrementalChange, subject) => {
        let undoLabel;
        const changes = recordChanges(subject, (subject) => {
          undoLabel = editFunc(subject);
        });
        return {
          changes: changes,
          undoLabel: undoLabel,
          broadcast: true,
        };
      },
      senderID,
      doInstance
    );
  }

  async editGlyph(editFunc, senderID) {
    return await this._editGlyphOrInstance(editFunc, senderID, false);
  }

  async editInstance(editFunc, senderID) {
    return await this._editGlyphOrInstance(editFunc, senderID, true);
  }

  async _editGlyphOrInstance(editFunc, senderID, doInstance) {
    if (this._glyphEditingDonePromise) {
      throw new Error("can't call _editGlyphOrInstance() while it's still running");
    }
    let editingDone;
    this._glyphEditingDonePromise = new Promise((resolve) => {
      editingDone = resolve;
    });
    try {
      return await this._editGlyphOrInstanceUnchecked(editFunc, senderID, doInstance);
    } finally {
      editingDone();
      delete this._glyphEditingDonePromise;
      delete this._cancelGlyphEditing;
    }
  }

  async _editGlyphOrInstanceUnchecked(editFunc, senderID, doInstance) {
    const glyphName = this.sceneModel.getSelectedGlyphName();
    const varGlyph = await this.sceneModel.fontController.getGlyph(glyphName);
    const baseChangePath = ["glyphs", glyphName];

    let editSubject;
    if (doInstance) {
      const glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
      if (!glyphController.canEdit) {
        // TODO: add options to dialog:
        // - go to closest source
        // - insert new source here
        // - cancel
        const result = await dialog(
          `Can’t edit glyph “${glyphName}”`,
          "Location is not at a source.",
          [{ title: "Okay", resultValue: "ok" }],
          2500 /* auto dismiss after a timeout */
        );
        return;
      }

      editSubject = glyphController.instance;
      const layerIndex = varGlyph.getLayerIndex(
        varGlyph.sources[glyphController.sourceIndex].layerName
      );
      baseChangePath.push("layers", layerIndex, "glyph");
    } else {
      editSubject = varGlyph.glyph;
    }

    const editContext = await this.sceneModel.fontController.getGlyphEditContext(
      glyphName,
      baseChangePath,
      senderID || this
    );
    const sendIncrementalChange = async (change, mayDrop = false) => {
      if (change && hasChange(change)) {
        await editContext.editIncremental(change, mayDrop);
      }
    };
    const initialSelection = this.selection;
    // editContext.editBegin();
    let result;
    try {
      result = await editFunc(sendIncrementalChange, editSubject);
    } catch (error) {
      this.selection = initialSelection;
      editContext.editCancel();
      throw error;
    }

    const {
      changes: changes,
      undoLabel: undoLabel,
      broadcast: broadcast,
    } = result || {};

    if (changes && changes.hasChange) {
      const undoInfo = {
        label: undoLabel,
        undoSelection: initialSelection,
        redoSelection: this.selection,
        location: this.getLocation(),
      };
      if (!this._cancelGlyphEditing) {
        editContext.editFinal(
          changes.change,
          changes.rollbackChange,
          undoInfo,
          broadcast
        );
      } else {
        applyChange(editSubject, changes.rollbackChange);
        await editContext.editIncremental(changes.rollbackChange, false);
        editContext.editCancel();
        dialog(
          "The glyph could not be saved.",
          `The edit has been reverted.\n\n${this._cancelGlyphEditing}`,
          [{ title: "Okay", resultValue: "ok" }]
        );
      }
    } else {
      this.selection = initialSelection;
      editContext.editCancel();
    }
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
    const undoInfo = await this.sceneModel.fontController.undoRedoGlyph(
      glyphName,
      isRedo
    );
    if (undoInfo !== undefined) {
      this.selection = undoInfo.undoSelection;
      if (undoInfo.location) {
        await this.setLocation(undoInfo.location);
      }
      await this.sceneModel.updateScene();
      this.canvasController.requestUpdate();
    }
    return undoInfo !== undefined;
  }

  async reverseSelectedContoursDirection() {
    await this.editInstanceAndRecordChanges((instance) => {
      const path = instance.path;
      const { point: pointSelection } = parseSelection(this.selection);
      const selectedContours = getSelectedContours(path, pointSelection);
      const newSelection = reversePointSelection(path, pointSelection);

      for (const contourIndex of selectedContours) {
        const contour = path.getUnpackedContour(contourIndex);
        contour.points.reverse();
        if (contour.isClosed) {
          const [lastPoint] = contour.points.splice(-1, 1);
          contour.points.splice(0, 0, lastPoint);
        }
        const packedContour = packContour(contour);
        instance.path.deleteContour(contourIndex);
        instance.path.insertContour(contourIndex, packedContour);
      }
      this.selection = newSelection;
      return "Reverse Contour Direction";
    });
  }

  async setStartPoint() {
    await this.editInstanceAndRecordChanges((instance) => {
      const path = instance.path;
      const { point: pointSelection } = parseSelection(this.selection);
      const contourToPointMap = new Map();
      for (const pointIndex of pointSelection) {
        const contourIndex = path.getContourIndex(pointIndex);
        const contourStartPoint = path.getAbsolutePointIndex(contourIndex, 0);
        if (contourToPointMap.has(contourIndex)) {
          continue;
        }
        contourToPointMap.set(contourIndex, pointIndex - contourStartPoint);
      }
      const newSelection = new Set();

      contourToPointMap.forEach((contourPointIndex, contourIndex) => {
        if (contourPointIndex === 0) {
          // Already start point
          newSelection.add(`point/${path.getAbsolutePointIndex(contourIndex, 0)}`);
          return;
        }
        if (!path.contourInfo[contourIndex].isClosed) {
          // Open path, ignore
          return;
        }
        const contour = path.getUnpackedContour(contourIndex);
        const head = contour.points.splice(0, contourPointIndex);
        contour.points.push(...head);
        instance.path.deleteContour(contourIndex);
        instance.path.insertContour(contourIndex, packContour(contour));
        newSelection.add(`point/${path.getAbsolutePointIndex(contourIndex, 0)}`);
      });

      this.selection = newSelection;
      return "Set Start Point";
    });
  }

  async breakContour() {
    await this.editInstanceAndRecordChanges((instance) => {
      let numSplits;
      const { point: pointIndices } = parseSelection(this.selection);
      numSplits = splitPathAtPointIndices(instance.path, pointIndices);
      this.selection = new Set();
      return "Break Contour" + (numSplits > 1 ? "s" : "");
    });
  }

  async decomposeSelectedComponents() {
    const { component: componentSelection } = parseSelection(this.selection);
    componentSelection.sort((a, b) => (a > b) - (a < b));
    const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;

    const { path: newPath, components: newComponents } = await decomposeComponents(
      instance.components,
      componentSelection,
      this.getGlobalLocation(),
      (glyphName) => this.sceneModel.fontController.getGlyph(glyphName)
    );

    await this.editInstanceAndRecordChanges((instance) => {
      const path = instance.path;
      const components = instance.components;

      for (const contour of newPath.iterContours()) {
        // Hm, rounding should be optional
        // contour.coordinates = contour.coordinates.map(c => Math.round(c));
        path.appendContour(contour);
      }
      components.push(...newComponents);

      // Next, delete the components we decomposed
      for (const componentIndex of reversed(componentSelection)) {
        components.splice(componentIndex, 1);
      }

      this.selection = new Set();
      return "Decompose Component" + (componentSelection?.length === 1 ? "" : "s");
    });
  }

  getPathConnectDetector() {
    return new PathConnectDetector(this);
  }
}

class PathConnectDetector {
  constructor(sceneController) {
    this.sceneController = sceneController;
    const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
    this.path = positionedGlyph.glyph.path;
    const selection = sceneController.selection;
    if (selection.size !== 1) {
      return;
    }
    const { point: pointSelection } = parseSelection(selection);
    if (
      pointSelection?.length !== 1 ||
      !this.path.isStartOrEndPoint(pointSelection[0])
    ) {
      return;
    }
    this.connectSourcePointIndex = pointSelection[0];
  }

  shouldConnect(showConnectIndicator = false) {
    if (this.connectSourcePointIndex === undefined) {
      return false;
    }

    const sceneController = this.sceneController;
    const connectSourcePoint = this.path.getPoint(this.connectSourcePointIndex);
    const connectTargetPointIndex = this.path.pointIndexNearPoint(
      connectSourcePoint,
      sceneController.mouseClickMargin,
      this.connectSourcePointIndex
    );
    const shouldConnect =
      connectTargetPointIndex !== undefined &&
      connectTargetPointIndex !== this.connectSourcePointIndex &&
      !!this.path.isStartOrEndPoint(connectTargetPointIndex);
    if (showConnectIndicator && shouldConnect) {
      sceneController.sceneModel.pathConnectTargetPoint = this.path.getPoint(
        connectTargetPointIndex
      );
    } else {
      delete sceneController.sceneModel.pathConnectTargetPoint;
    }
    this.connectTargetPointIndex = connectTargetPointIndex;
    return shouldConnect;
  }

  clearConnectIndicator() {
    delete this.sceneController.sceneModel.pathConnectTargetPoint;
  }
}

function reversePointSelection(path, pointSelection) {
  const newSelection = [];
  for (const pointIndex of pointSelection) {
    const contourIndex = path.getContourIndex(pointIndex);
    const contourStartPoint = path.getAbsolutePointIndex(contourIndex, 0);
    const numPoints = path.getNumPointsOfContour(contourIndex);
    let newPointIndex = pointIndex;
    if (path.contourInfo[contourIndex].isClosed) {
      if (newPointIndex != contourStartPoint) {
        newPointIndex =
          contourStartPoint + numPoints - (newPointIndex - contourStartPoint);
      }
    } else {
      newPointIndex =
        contourStartPoint + numPoints - 1 - (newPointIndex - contourStartPoint);
    }
    newSelection.push(`point/${newPointIndex}`);
  }
  newSelection.sort((a, b) => (a > b) - (a < b));
  return new Set(newSelection);
}

function getSelectedContours(path, pointSelection) {
  const selectedContours = new Set();
  for (const pointIndex of pointSelection) {
    selectedContours.add(path.getContourIndex(pointIndex));
  }
  return [...selectedContours];
}
