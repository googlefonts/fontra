import { UndoStack, reverseUndoRecord } from "@fontra/core/font-controller.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { isDisjoint, symmetricDifference, union } from "@fontra/core/set-ops.js";
import { arrowKeyDeltas, assert, round } from "@fontra/core/utils.js";
import { dialog } from "@fontra/web-components/modal-dialog.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { equalGlyphSelection } from "./scene-controller.js";
import {
  glyphSelector,
  registerVisualizationLayerDefinition,
} from "./visualization-layer-definitions.js";

export class MetricsTool {
  identifier = "metrics-tool";
  subTools = [SidebearingTool, KerningTool];
}

class MetricsBaseTool extends BaseTool {
  constructor(editor) {
    super(editor);
    this.fontController = editor.fontController;

    this.handleContainer = document.querySelector("#metric-handle-container");
    assert(this.handleContainer);

    this.sceneSettingsController.addKeyListener("glyphLines", (event) => {
      if (event.senderInfo?.senderID !== this) {
        this.handles.forEach((handle) => handle.remove());
      }
    });

    this.sceneSettingsController.addKeyListener(
      ["viewBox", "positionedLines"],
      (event) => {
        this.handles.forEach((handle) => {
          this._updateHandle(handle);
          this.getPinPointDelta(); // updates this._prevousMetricCenter
        });
      }
    );

    this.undoStack = new UndoStack();
    this._getPinPointDelta = () => this.getPinPointDelta();
  }

  getScrollAdjustBehavior() {
    return { behavior: "tool-pin-point", getPinPointDelta: this._getPinPointDelta };
  }

  getPinPointDelta() {
    let deltaX = 0;
    const selector = this._draggingSelector || this.metricSelection.at(-1);
    const currentCenter = this.getPositionedMetricCenter(selector);
    if (currentCenter != undefined) {
      if (this._prevousMetricCenter == undefined) {
        this._prevousMetricCenter = currentCenter;
      }
      deltaX = currentCenter - this._prevousMetricCenter;
    }
    this._prevousMetricCenter = currentCenter;
    return deltaX;
  }

  getPositionedMetricCenter(selector) {
    assert(false, "superclass must implement");
  }

  selectorToId(selector) {
    assert(false, "superclass must implement");
  }

  metricAtPoint(point, size, previousLineIndex, previousGlyphIndex) {
    assert(false, "superclass must implement");
  }

  setCursor() {
    assert(false, "superclass must implement");
  }

  removeAllHandles() {
    this.handles.forEach((handle) => handle.remove());
  }

  get selectedHandles() {
    return this.handles.filter((handle) => handle.selected);
  }

  get metricSelection() {
    return this.selectedHandles.map((handle) => handle.selectedSelector);
  }

  set metricSelection(selection) {
    this.removeAllHandles();
    for (const selector of selection) {
      this.addHandle(selector, true);
    }

    this._prevousMetricCenter = this.getPositionedMetricCenter(selection.at(-1));
  }

  handleHover(event) {
    if (event.type != "mousemove") {
      return;
    }
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;

    const hoveredMetric = this.metricAtPoint(
      point,
      size,
      this.hoveredMetric?.lineIndex,
      this.hoveredMetric?.glyphIndex
    );
    if (!equalGlyphSelection(this.hoveredMetric, hoveredMetric)) {
      this.hoveredMetric = hoveredMetric;

      const hoveredHandleId = hoveredMetric ? this.selectorToId(hoveredMetric) : null;

      this.handles.forEach((handle) => {
        if (handle.id !== hoveredHandleId && !handle.selected) {
          handle.remove();
        } else {
          handle.updateHover(null);
        }
      });

      if (hoveredMetric) {
        const handle = document.getElementById(hoveredHandleId);
        if (!handle) {
          this.addHandle(hoveredMetric);
        } else {
          handle.updateHover(hoveredMetric);
        }
      }
      this.setCursor();
    }
  }

  async _prepareDrag(eventStream, initialEvent) {
    const hoveredMetric = this.hoveredHandle?.selector || this.hoveredMetric;

    if (!hoveredMetric) {
      if (!event.shiftKey) {
        this.removeAllHandles();
      }
      return;
    }

    this._selectHandle(hoveredMetric, event.shiftKey);

    this._prevousMetricCenter = this.getPositionedMetricCenter(
      this.metricSelection.at(-1)
    );

    return (await shouldInitiateDrag(eventStream, initialEvent)) ? hoveredMetric : null;
  }

  _selectHandle(selector, shiftKey) {
    const handleId = this.selectorToId(selector);
    const selectedHandle = document.getElementById(handleId);
    if (!selectedHandle) {
      // Shouldn't happen, but does (rarely), some glitchy async timing thing
      return;
    }

    const shouldDeselect = !selectedHandle.hasSelection(selector);

    if (shiftKey) {
      selectedHandle.toggleSelection(selector);
    } else {
      this.handles.forEach((handle) => {
        if (handle.id === handleId) {
          selectedHandle.toggleSelection(selector, true);
        } else if (shouldDeselect) {
          handle.remove();
        }
      });
    }
  }

  activate() {
    super.activate();
    this.sceneSettings.selectedGlyph = null;
    this.sceneController.hoveredGlyph = null;
    if (this._selectionState?.glyphLines === this.sceneSettings.glyphLines) {
      this.metricSelection = this._selectionState.selectors;
    }

    this.setCursor();
  }

  deactivate() {
    super.deactivate();
    this._selectionState = {
      glyphLines: this.sceneSettings.glyphLines,
      selectors: this.metricSelection,
    };
    delete this.hoveredMetric;
    this.removeAllHandles();
  }

  getPositionedGlyph(selector) {
    if (!selector) {
      return undefined;
    }
    const { lineIndex, glyphIndex } = selector;
    return this.sceneSettings.positionedLines[lineIndex]?.glyphs[glyphIndex];
  }

  getUndoRedoLabel(isRedo) {
    const info = this.undoStack.getTopUndoRedoRecord(isRedo)?.info;
    return (
      (isRedo ? translate("action.redo") : translate("action.undo")) +
      (info ? " " + info.label : "")
    );
  }

  canUndoRedo(isRedo) {
    return !!this.undoStack.getTopUndoRedoRecord(isRedo)?.info;
  }

  async doUndoRedo(isRedo) {
    let undoRecord = this.undoStack.popUndoRedoRecord(isRedo);
    if (!undoRecord) {
      return;
    }
    if (isRedo) {
      undoRecord = reverseUndoRecord(undoRecord);
    }

    this.sceneController.scrollAdjustBehavior = this.getScrollAdjustBehavior();

    this.fontController.applyChange(undoRecord.rollbackChange);

    const error = await this.fontController.editFinal(
      undoRecord.rollbackChange,
      undoRecord.change,
      undoRecord.info.label,
      true
    );

    this.sceneSettingsController.setItem("glyphLines", undoRecord.info.glyphLines, {
      senderID: this,
    });
    this.sceneSettings.fontLocationSourceMapped = undoRecord.info.location;
    this.metricSelection = undoRecord.info.metricSelection;
  }

  pushUndoItem(changes, undoLabel) {
    const undoRecord = {
      change: changes.change,
      rollbackChange: changes.rollbackChange,
      info: {
        label: undoLabel,
        glyphLines: this.sceneSettings.glyphLines,
        location: this.sceneSettings.fontLocationSourceMapped,
        metricSelection: this.metricSelection,
      },
    };

    this.undoStack.pushUndoRecord(undoRecord);
  }
}

class SidebearingTool extends MetricsBaseTool {
  iconPath = "/images/sidebearingtool.svg";
  identifier = "sidebearing-tool";

  selectorToId(selector) {
    return sidebearingSelectorToId(selector);
  }

  metricAtPoint(point, size, previousLineIndex, previousGlyphIndex) {
    return this.sceneModel.sidebearingAtPoint(
      point,
      size,
      previousLineIndex,
      previousGlyphIndex
    );
  }

  addHandle(selector, select = false) {
    const handle = new SidebearingHandle(selector);
    this._updateHandle(handle);
    this.handleContainer.appendChild(handle);
    handle.toggleSelection(selector, select);
  }

  _updateHandle(sidebearingHandle) {
    const { lineIndex, glyphIndex } = sidebearingHandle.selector;
    const positionedGlyph =
      this.sceneModel.positionedLines[lineIndex]?.glyphs[glyphIndex];
    if (!positionedGlyph) {
      return;
    }

    sidebearingHandle.update(positionedGlyph, this.canvasController);
  }

  getPositionedMetricCenter(selector) {
    const positionedGlyph = this.getPositionedGlyph(selector);
    if (!positionedGlyph) {
      return undefined;
    }
    return positionedGlyph.x - positionedGlyph.glyph.xAdvance / 2;
  }

  get handles() {
    return [...this.handleContainer.querySelectorAll("sidebearing-handle")];
  }

  get hoveredHandle() {
    return this.handleContainer.querySelector("sidebearing-handle.hovered");
  }

  setCursor() {
    const cursorMap = {
      left: "w-resize",
      right: "e-resize",
      shape: "ew-resize",
    };

    this.canvasController.canvas.style.cursor =
      cursorMap[this.hoveredMetric?.metric] || null;
  }

  async handleDrag(eventStream, initialEvent) {
    const selector = await this._prepareDrag(eventStream, initialEvent);
    if (!selector) {
      return;
    }

    console.log("do drag");
  }
}

class BaseMetricHandle extends HTMLElement {
  _forwardEventToCanvas(event) {
    const canvas = document.querySelector("#edit-canvas");

    event.preventDefault();
    event.stopImmediatePropagation();
    const newEvent = new event.constructor(event.type, event);
    canvas.dispatchEvent(newEvent);
  }
}

class SidebearingHandle extends BaseMetricHandle {
  constructor(selector) {
    super();

    this._selection = new Set();

    this.advanceElement = html.div({ class: "advance" }, ["advance"]);
    this.leftSidebearingElement = html.div({ class: "left-sidebearing" }, ["left"]);
    this.rightSidebearingElement = html.div({ class: "right-sidebearing" }, ["right"]);

    this.appendChild(this.advanceElement);
    this.appendChild(this.leftSidebearingElement);
    this.appendChild(this.rightSidebearingElement);

    this.id = sidebearingSelectorToId(selector);

    this.addEventListener("mousedown", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("wheel", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("contextmenu", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("mouseenter", (event) => this.classList.add("hovered"));
    this.addEventListener("mouseleave", (event) => this.classList.remove("hovered"));

    this.updateHover(selector);
  }

  update(positionedGlyph, canvasController) {
    const { x: left, y: top } = canvasController.canvasPoint({
      x: positionedGlyph.x,
      y: positionedGlyph.y,
    });

    const { x: right } = canvasController.canvasPoint({
      x: positionedGlyph.x + positionedGlyph.glyph.xAdvance,
      y: positionedGlyph.y,
    });

    this.style.left = `${left}px`;
    this.style.top = `${top}px`;
    this.style.width = `${right - left}px`;

    this.advanceElement.innerText = formatMetricValue(positionedGlyph.glyph.xAdvance);
    this.leftSidebearingElement.innerText = formatMetricValue(
      positionedGlyph.glyph.leftMargin,
      "\u00A0"
    );
    this.rightSidebearingElement.innerText = formatMetricValue(
      positionedGlyph.glyph.rightMargin,
      "\u00A0"
    );
  }

  updateHover(selector) {
    this.selector = selector || this.selector;

    const [metric] = selector ? metricSelectionSet(selector) : [""];

    this.leftSidebearingElement.classList.toggle(
      "hovered",
      metric === "left" || metric == "shape"
    );
    this.rightSidebearingElement.classList.toggle(
      "hovered",
      metric === "right" || metric == "shape"
    );
  }

  get selected() {
    return this._selection.size > 0;
  }

  hasSelection(selector) {
    assert(
      this.selector.lineIndex === selector.lineIndex &&
        this.selector.glyphIndex === selector.glyphIndex
    );
    return !isDisjoint(metricSelectionSet(selector), this._selection);
  }

  toggleSelection(selector, onOff = undefined) {
    assert(
      this.selector.lineIndex === selector.lineIndex &&
        this.selector.glyphIndex === selector.glyphIndex
    );
    const newSelection = metricSelectionSet(selector);
    if (onOff === undefined) {
      this._selection = symmetricDifference(this._selection, newSelection);
    } else if (onOff) {
      this._selection = isDisjoint(this._selection, newSelection)
        ? newSelection
        : union(this._selection, newSelection);
    } else {
      this._selection = new Set();
    }

    this.leftSidebearingElement.classList.toggle(
      "selected",
      this._selection.has("left") || this._selection.has("shape")
    );
    this.rightSidebearingElement.classList.toggle(
      "selected",
      this._selection.has("right") || this._selection.has("shape")
    );
  }

  get selectedSelector() {
    return {
      ...this.selector,
      metric: [...this._selection].sort().join(",") || this.selector.metric,
    };
  }
}

customElements.define("sidebearing-handle", SidebearingHandle);

let theKerningTool; // global singleton

function kerningVisualizationSelector(forTool) {
  return (visContext, layer) => {
    if (forTool === theKerningTool?.isActive) {
      return glyphSelector("all")(visContext, layer);
    } else {
      return [];
    }
  };
}

const kernVisualizationDefinition = {
  identifier: "fontra.kerning-indicators",
  name: "sidebar.user-settings.glyph.kerning",
  selectionFunc: kerningVisualizationSelector(false),
  userSwitchable: true,
  defaultOn: false,
  zIndex: 190,
  colors: { negativeKernColor: "#F1175933", positiveKernColor: "#1759F133" },
  colorsDarkMode: { negativeKernColor: "#FF336655", positiveKernColor: "#3366FF55" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!positionedGlyph.kernValue) {
      return;
    }
    context.fillStyle =
      positionedGlyph.kernValue > 0
        ? parameters.positiveKernColor
        : parameters.negativeKernColor;

    const ascender = model.ascender;
    const descender = model.descender;
    context.fillRect(0, descender, -positionedGlyph.kernValue, ascender - descender);
  },
};

registerVisualizationLayerDefinition(kernVisualizationDefinition);
registerVisualizationLayerDefinition({
  ...kernVisualizationDefinition,
  identifier: "fontra.kerning-indicators-tool",
  name: "sidebar.user-settings.glyph.kerning-tool",
  selectionFunc: kerningVisualizationSelector(true),
  defaultOn: true,
});

class KerningTool extends MetricsBaseTool {
  iconPath = "/images/kerningtool.svg";
  identifier = "kerning-tool";

  constructor(editor) {
    super(editor);

    this.kerningController = null;

    this.sceneSettingsController.addKeyListener("applyKerning", (event) => {
      if (!event.newValue && this.sceneController.selectedTool === this) {
        this.editor.setSelectedTool("pointer-tool");
      }
    });

    this.fontController.addChangeListener(
      { kerning: null },
      (change, isExternalChange) => {
        if (isExternalChange) {
          this.undoStack.clear();
        }
      },
      false
    );

    assert(!theKerningTool);
    theKerningTool = this;
  }

  selectorToId(selector) {
    return kerningSelectorToId(selector);
  }

  metricAtPoint(point, size, previousLineIndex, previousGlyphIndex) {
    return this.sceneModel.kerningAtPoint(point, size);
  }

  async handleDrag(eventStream, initialEvent) {
    const selector = await this._prepareDrag(eventStream, initialEvent);
    if (!selector) {
      return;
    }

    const { editContext, values } = await this.getEditContext();
    if (!editContext) {
      return;
    }

    const magnification = this.canvasController.magnification;
    const initialX = initialEvent.x / magnification;

    async function* generateValues() {
      for await (const event of eventStream) {
        if (event.x == undefined && event.pageX == undefined) {
          continue;
        }

        this.sceneController.scrollAdjustBehavior = this.getScrollAdjustBehavior();

        const currentX = event.x / magnification;
        const step = getKerningStep(event);
        const deltaX = Math.round((currentX - initialX) / step) * step;

        yield values.map((v) => v + deltaX);
      }

      delete self._offsetDeltaX;
    }

    generateValues = generateValues.bind(this); // Because `this` scoping

    this._draggingSelector = selector;
    this._prevousMetricCenter = this.getPositionedMetricCenter(this._draggingSelector);

    const undoLabel = "edit kerning";
    const changes = await editContext.editContinuous(generateValues(), undoLabel);
    delete this._draggingSelector;

    this.pushUndoItem(changes, undoLabel);
  }

  async handleArrowKeys(event) {
    let [deltaX, deltaY] = arrowKeyDeltas[event.key];
    if (deltaY) {
      return;
    }

    deltaX *= getKerningStep(event);

    const { editContext, values } = await this.getEditContext();
    if (!editContext) {
      return;
    }

    this.sceneController.scrollAdjustBehavior = this.getScrollAdjustBehavior();

    const newValues = values.map((v) => v + deltaX);
    const undoLabel = "edit kerning";
    const changes = await editContext.edit(newValues, undoLabel);
    this.pushUndoItem(changes, undoLabel);
  }

  async getEditContext(wantValues = true) {
    const sourceIdentifier = this.getSourceIdentifier();
    if (!sourceIdentifier && wantValues) {
      this.showDialogLocationNotAtSource();
      return {};
    }

    const pairSelectors = [];
    const values = [];
    for (const handle of this.selectedHandles) {
      const { leftName, rightName } = this.getPairNamesFromSelector(handle.selector);
      pairSelectors.push({ leftName, rightName, sourceIdentifier });
      if (wantValues) {
        values.push(
          this.kerningController.getPairValueForSource(
            leftName,
            rightName,
            sourceIdentifier
          ) || 0
        );
      }
    }

    if (!pairSelectors.length) {
      return {};
    }

    const editContext = this.kerningController.getEditContext(pairSelectors);

    return { editContext, values };
  }

  getGlyphNamesFromSelector(selector) {
    const { lineIndex, glyphIndex } = selector;
    assert(glyphIndex > 0);
    const glyphs = this.sceneModel.positionedLines[lineIndex].glyphs;
    const leftGlyph = glyphs[glyphIndex - 1].glyphName;
    const rightGlyph = glyphs[glyphIndex].glyphName;
    return { leftGlyph, rightGlyph };
  }

  getPairNamesFromSelector(selector) {
    const { leftGlyph, rightGlyph } = this.getGlyphNamesFromSelector(selector);
    return this.kerningController.getPairNames(leftGlyph, rightGlyph);
  }

  async showDialogLocationNotAtSource() {
    const glyphName = this.sceneSettings.selectedGlyphName;
    const result = await dialog(
      translate("dialog.cant-edit-kerning.title"),
      translate("dialog.cant-edit-glyph.content.location-not-at-source"),
      [
        {
          title: translate("dialog.cancel"),
          resultValue: "cancel",
          isCancelButton: true,
        },
        {
          title: translate("sources.button.go-to-nearest-source"),
          resultValue: "goToNearestSource",
          isDefaultButton: true,
        },
      ]
    );
    if (result === "goToNearestSource") {
      this.editor.goToNearestSource();
    }
  }

  getSourceIdentifier() {
    return this.fontController.fontSourcesInstancer.getSourceIdentifierForLocation(
      this.sceneSettings.fontLocationSourceMapped
    );
  }

  addHandle(selector, select = false) {
    const handle = new KerningHandle(selector);
    this._updateHandle(handle);
    this.handleContainer.appendChild(handle);
    handle.toggleSelection(selector, select);
  }

  _updateHandle(kerningHandle) {
    const { lineIndex, glyphIndex } = kerningHandle.selector;
    const positionedGlyph =
      this.sceneModel.positionedLines[lineIndex]?.glyphs[glyphIndex];
    if (!positionedGlyph) {
      return;
    }

    const { leftName, rightName } = this.getPairNamesFromSelector(
      kerningHandle.selector
    );
    kerningHandle.update(positionedGlyph, leftName, rightName, this.canvasController);
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = this.hoveredMetric ? "ew-resize" : null;
  }

  activate() {
    super.activate();

    if (!this.sceneSettings.applyKerning) {
      this.sceneSettings.applyKerning = true;
    }

    this.fontController.getKerningController("kern").then((kerningController) => {
      this.kerningController = kerningController;
    });
  }

  get handles() {
    return [...this.handleContainer.querySelectorAll("kerning-handle")];
  }

  get hoveredHandle() {
    return this.handleContainer.querySelector("kerning-handle.hovered");
  }

  canDelete() {
    return !!this.selectedHandles.length;
  }

  async doDelete(event) {
    const deepDelete = event.altKey;

    const { editContext, values } = await this.getEditContext(!deepDelete);
    if (!editContext) {
      return;
    }

    this.sceneController.scrollAdjustBehavior = this.getScrollAdjustBehavior();

    let undoLabel;
    let changes;
    if (deepDelete) {
      undoLabel = "delete kerning pair from all sources";
      changes = await editContext.delete(undoLabel);
    } else {
      undoLabel = "delete kerning value";
      const newValues = new Array(values.length).fill(null);
      changes = await editContext.edit(newValues, undoLabel);
    }
    this.pushUndoItem(changes, undoLabel);
  }

  getPositionedMetricCenter(selector) {
    const positionedGlyph = this.getPositionedGlyph(selector);
    if (!positionedGlyph) {
      return undefined;
    }
    return positionedGlyph.x - positionedGlyph.kernValue / 2;
  }

  getContextMenuItems() {
    const contextMenuItems = [];
    const selector = this.hoveredHandle?.selector || this.hoveredMetric;

    if (selector) {
      const { leftGlyph, rightGlyph } = this.getGlyphNamesFromSelector(selector);
      const { leftName, rightName } = this.getPairNamesFromSelector(selector);

      const leftIsGroup = leftName.startsWith("@");
      const rightIsGroup = rightName.startsWith("@");

      if (leftIsGroup || rightIsGroup) {
        contextMenuItems.push({
          title: `Make kerning exception ${leftGlyph} ${rightGlyph}`,
          callback: (event) =>
            this.makeKerningException(leftName, rightName, leftGlyph, rightGlyph),
        });
      }

      if (leftIsGroup && rightIsGroup) {
        contextMenuItems.push({
          title: `Make kerning exception ${leftGlyph} ${rightName}`,
          callback: (event) =>
            this.makeKerningException(leftName, rightName, leftGlyph, rightName),
        });
        contextMenuItems.push({
          title: `Make kerning exception ${leftName} ${rightGlyph}`,
          callback: (event) =>
            this.makeKerningException(leftName, rightName, leftName, rightGlyph),
        });
      }
    }
    return contextMenuItems;
  }

  async makeKerningException(
    leftNameExisting,
    rightNameExisting,
    leftNameNew,
    rightNameNew
  ) {
    let values = this.kerningController.getPairValues(
      leftNameExisting,
      rightNameExisting
    );

    if (!values) {
      values = Array(this.kerningController.sourceIdentifiers.length).fill(null);
    } else {
      values = [...values];
      while (values.length < this.kerningController.sourceIdentifiers.length) {
        values.push(null);
      }
    }

    const pairSelectors = this.kerningController.sourceIdentifiers.map(
      (sourceIdentifier) => ({
        sourceIdentifier,
        leftName: leftNameNew,
        rightName: rightNameNew,
      })
    );

    const editContext = this.kerningController.getEditContext(pairSelectors);

    const undoLabel = `make kerning exception ${leftNameNew} ${rightNameNew}`;
    const changes = await editContext.edit(values, undoLabel);

    this.pushUndoItem(changes, undoLabel);
  }
}

class KerningHandle extends BaseMetricHandle {
  constructor(selector) {
    super();

    this.selector = selector;

    this.valueElement = html.div({
      class: "value",
      // ondblclick: (event) => ...edit value...,
    });
    this.leftNameElement = html.div({ class: "left-name" });
    this.rightNameElement = html.div({ class: "right-name" });

    this.appendChild(this.valueElement);
    this.appendChild(this.leftNameElement);
    this.appendChild(this.rightNameElement);

    this.id = kerningSelectorToId(selector);

    this.addEventListener("mousedown", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("wheel", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("contextmenu", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("mouseenter", (event) => this.classList.add("hovered"));
    this.addEventListener("mouseleave", (event) => this.classList.remove("hovered"));
  }

  update(positionedGlyph, leftName, rightName, canvasController) {
    const { x, y } = canvasController.canvasPoint({
      x: positionedGlyph.x - positionedGlyph.kernValue / 2,
      y: positionedGlyph.y,
    });
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;

    this.classList.toggle("positive", positionedGlyph.kernValue > 0);
    this.classList.toggle("negative", positionedGlyph.kernValue < 0);

    this.valueElement.innerText = formatMetricValue(positionedGlyph.kernValue);

    this.leftNameElement.innerText = leftName;
    this.leftNameElement.classList.toggle("group", leftName.startsWith("@"));
    this.rightNameElement.innerText = rightName;
    this.rightNameElement.classList.toggle("group", rightName.startsWith("@"));
  }

  updateHover(selector) {
    // nothing to do for kern handle
  }

  get selected() {
    return this.classList.contains("selected");
  }

  hasSelection(selector) {
    assert(
      this.selector.lineIndex === selector.lineIndex &&
        this.selector.glyphIndex === selector.glyphIndex
    );
    return true;
  }

  toggleSelection(selector, onOff = undefined) {
    assert(
      this.selector.lineIndex === selector.lineIndex &&
        this.selector.glyphIndex === selector.glyphIndex
    );
    this.classList.toggle("selected", onOff);
  }

  get selectedSelector() {
    return this.selector;
  }
}

customElements.define("kerning-handle", KerningHandle);

function getKerningStep(event) {
  return event.altKey ? (event.shiftKey ? 50 : 5) : event.shiftKey ? 10 : 1;
}

function formatMetricValue(n, fallback = "-") {
  if (n == null) {
    return fallback;
  }
  n = round(n, 1);
  return n == undefined ? "\u00A0" : n.toString();
}

function kerningSelectorToId(kerningSelector) {
  const { lineIndex, glyphIndex } = kerningSelector;
  return `kerning-selector-${lineIndex}/${glyphIndex}`;
}

function sidebearingSelectorToId(kerningSelector) {
  const { lineIndex, glyphIndex } = kerningSelector;
  return `sidebearing-selector-${lineIndex}/${glyphIndex}`;
}

function metricSelectionSet(selector) {
  return new Set(selector.metric.split(","));
}
