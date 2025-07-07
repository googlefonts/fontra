import { UndoStack, reverseUndoRecord } from "@fontra/core/font-controller.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
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

export class SidebearingTool extends BaseTool {
  iconPath = "/images/sidebearingtool.svg";
  identifier = "sidebearing-tool";

  handleHover(event) {
    if (event.type != "mousemove") {
      return;
    }

    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;

    const hoveredSidebearing = this.sceneModel.sidebearingAtPoint(
      point,
      size,
      this.hoveredSidebearing?.lineIndex,
      this.hoveredSidebearing?.glyphIndex
    );

    if (!equalGlyphSelection(this.hoveredSidebearing, hoveredSidebearing)) {
      this.hoveredSidebearing = hoveredSidebearing;
    }
  }

  async handleDrag(eventStream, initialEvent) {
    //
  }
}

let theKerningTool; // global simpleton

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

export class KerningTool extends BaseTool {
  iconPath = "/images/kerningtool.svg";
  identifier = "kerning-tool";

  constructor(editor) {
    super(editor);
    this.fontController = editor.fontController;
    this.kerningController = null;

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
          this.getPinPointDelta(); // updates this._prevousKerningCenter
        });
      }
    );
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

    this.undoStack = new UndoStack();
    this._getPinPointDelta = () => this.getPinPointDelta();

    assert(!theKerningTool);
    theKerningTool = this;
  }

  handleHover(event) {
    if (event.type != "mousemove") {
      return;
    }
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;

    const hoveredKerning = this.sceneModel.kerningAtPoint(point, size);
    if (!equalGlyphSelection(this.hoveredKerning, hoveredKerning)) {
      this.hoveredKerning = hoveredKerning;

      const hoveredHandleId = hoveredKerning ? selectorToId(hoveredKerning) : null;

      this.handles.forEach((handle) => {
        if (handle.id !== hoveredHandleId && !handle.selected) {
          handle.remove();
        }
      });

      if (hoveredKerning) {
        const handle = document.getElementById(hoveredHandleId);
        if (!handle) {
          this.addHandle(hoveredKerning);
        }
      }
      this.setCursor();
    }
  }

  async handleDrag(eventStream, initialEvent) {
    const hoveredKerning = this.hoveredHandle?.selector || this.hoveredKerning;

    if (!hoveredKerning) {
      if (!event.shiftKey) {
        this.removeAllHandles();
      }
      return;
    }

    this._selectHandle(hoveredKerning, event.shiftKey);

    this._prevousKerningCenter = this.getPositionedKerningCenter(
      this.kerningSelection.at(-1)
    );

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
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

    this._draggingSelector = hoveredKerning;
    this._prevousKerningCenter = this.getPositionedKerningCenter(
      this._draggingSelector
    );

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
    const { leftName, rightName } = this.getPairNamesFromSelector(selector);
    const handle = new KerningHandle(selector);
    this._updateHandle(handle);
    this.handleContainer.appendChild(handle);
    handle.selected = select;
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

  _selectHandle(selector, shiftKey) {
    const handleId = selectorToId(selector);
    const selectedHandle = document.getElementById(handleId);
    if (!selectedHandle) {
      // Shouldn't happen, but does (rarely), some glitchy async timing thing
      return;
    }

    if (shiftKey) {
      selectedHandle.selected = !selectedHandle.selected;
    } else {
      this.handles.forEach((handle) => {
        if (handle.id === handleId) {
          handle.selected = true;
        } else if (!selectedHandle.selected) {
          handle.remove();
        }
      });
    }
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = this.hoveredKerning ? "pointer" : null;
  }

  activate() {
    super.activate();
    this.sceneSettings.selectedGlyph = null;
    this.sceneController.hoveredGlyph = null;
    if (this._selectionState?.glyphLines === this.sceneSettings.glyphLines) {
      this._selectionState.selectors.forEach((selector) =>
        this.addHandle(selector, true)
      );
    }
    if (!this.sceneSettings.applyKerning) {
      this.sceneSettings.applyKerning = true;
    }

    this.fontController.getKerningController("kern").then((kerningController) => {
      this.kerningController = kerningController;
    });

    this.setCursor();
  }

  deactivate() {
    super.deactivate();
    this._selectionState = {
      glyphLines: this.sceneSettings.glyphLines,
      selectors: this.selectedHandles.map((h) => h.selector),
    };
    delete this.hoveredKerning;
    this.removeAllHandles();
  }

  get kerningSelection() {
    return this.selectedHandles.map((handle) => handle.selector);
  }

  set kerningSelection(selection) {
    this.removeAllHandles();
    for (const selector of selection) {
      this.addHandle(selector, true);
    }

    this._prevousKerningCenter = this.getPositionedKerningCenter(selection.at(-1));
  }

  get handles() {
    return [...this.handleContainer.querySelectorAll("kerning-handle")];
  }

  get selectedHandles() {
    return this.handles.filter((handle) => handle.selected);
  }

  get hoveredHandle() {
    return this.handleContainer.querySelector("kerning-handle.hovered");
  }

  removeAllHandles() {
    this.handles.forEach((handle) => handle.remove());
  }

  getUndoRedoLabel(isRedo) {
    const info = this.undoStack.getTopUndoRedoRecord(isRedo)?.info;
    return (
      (isRedo ? translate("action.redo") : translate("action.undo")) +
      (info ? " " + info.label : "")
    );
  }

  canUndoRedo(isRedo) {
    return this.undoStack.getTopUndoRedoRecord(isRedo)?.info;
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
    this.kerningSelection = undoRecord.info.kerningSelection;
  }

  pushUndoItem(changes, undoLabel) {
    const undoRecord = {
      change: changes.change,
      rollbackChange: changes.rollbackChange,
      info: {
        label: undoLabel,
        glyphLines: this.sceneSettings.glyphLines,
        location: this.sceneSettings.fontLocationSourceMapped,
        kerningSelection: this.kerningSelection,
      },
    };

    this.undoStack.pushUndoRecord(undoRecord);
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

  getScrollAdjustBehavior() {
    return { behavior: "tool-pin-point", getPinPointDelta: this._getPinPointDelta };
  }

  getPinPointDelta() {
    let deltaX = 0;
    const selector = this._draggingSelector || this.kerningSelection.at(-1);
    const currentCenter = this.getPositionedKerningCenter(selector);
    if (currentCenter != undefined) {
      if (this._prevousKerningCenter == undefined) {
        this._prevousKerningCenter = currentCenter;
      }
      deltaX = currentCenter - this._prevousKerningCenter;
    }
    this._prevousKerningCenter = currentCenter;
    return deltaX;
  }

  getPositionedKerningCenter(selector) {
    const positionedGlyph = this.getPositionedGlyph(selector);
    if (!positionedGlyph) {
      return undefined;
    }
    return positionedGlyph.x - positionedGlyph.kernValue / 2;
  }

  getPositionedGlyph(selector) {
    if (!selector) {
      return undefined;
    }
    const { lineIndex, glyphIndex } = selector;
    return this.sceneSettings.positionedLines[lineIndex]?.glyphs[glyphIndex];
  }

  getContextMenuItems() {
    const contextMenuItems = [];
    const selector = this.hoveredHandle?.selector || this.hoveredKerning;

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

class KerningHandle extends HTMLElement {
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

    this.id = selectorToId(selector);
    this.classList.add("kerning-handle");

    this.addEventListener("mousedown", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("wheel", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("contextmenu", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("mouseenter", (event) => this.classList.add("hovered"));
    this.addEventListener("mouseleave", (event) => this.classList.remove("hovered"));
  }

  _forwardEventToCanvas(event) {
    const canvas = document.querySelector("#edit-canvas");

    event.preventDefault();
    event.stopImmediatePropagation();
    const newEvent = new event.constructor(event.type, event);
    canvas.dispatchEvent(newEvent);
  }

  update(positionedGlyph, leftName, rightName, canvasController) {
    let { x, y } = canvasController.canvasPoint({
      x: positionedGlyph.x - positionedGlyph.kernValue / 2,
      y: positionedGlyph.y,
    });
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;

    this.classList.toggle("positive", positionedGlyph.kernValue > 0);
    this.classList.toggle("negative", positionedGlyph.kernValue < 0);

    this.valueElement.innerText = formatKerningValue(positionedGlyph.kernValue);

    this.leftNameElement.innerText = leftName;
    this.leftNameElement.classList.toggle("group", leftName.startsWith("@"));
    this.rightNameElement.innerText = rightName;
    this.rightNameElement.classList.toggle("group", rightName.startsWith("@"));
  }

  get selected() {
    return this.classList.contains("selected");
  }

  set selected(onOff) {
    this.classList.toggle("selected", onOff);
  }
}

customElements.define("kerning-handle", KerningHandle);

function getKerningStep(event) {
  return event.altKey ? (event.shiftKey ? 50 : 5) : event.shiftKey ? 10 : 1;
}

function formatKerningValue(n) {
  if (n === null) {
    return "–";
  }
  n = round(n, 1);
  return n == undefined ? "\u00A0" : n.toString();
}

function selectorToId(kerningSelector) {
  const { lineIndex, glyphIndex } = kerningSelector;
  return `kerning-selector-${lineIndex}/${glyphIndex}`;
}
