import { UndoStack, reverseUndoRecord } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
import { commandKeyProperty } from "../core/utils.js";

export class BaseInfoPanel {
  constructor(applicationSettingsController, panelElement) {
    this.applicationSettingsController = applicationSettingsController;
    this.panelElement = panelElement;
  }

  visibilityChanged(onOff) {
    this.visible = onOff;
    if (onOff && !this.initialized) {
      this.initializePanel();
      this.initialized = true;
    }
  }

  initializePanel() {
    this.undoStack = new UndoStack();
    this.setupUI();
  }

  handleKeyDown(event) {
    if (event[commandKeyProperty]) {
      if (event.key == "z") {
        event.stopImmediatePropagation();
        event.preventDefault();
        this.doUndoRedo(event.shiftKey);
      }
    }
  }

  async doUndoRedo(isRedo) {
    let undoRecord = this.undoStack.popUndoRedoRecord(isRedo);
    if (!undoRecord) {
      return;
    }
    if (isRedo) {
      undoRecord = reverseUndoRecord(undoRecord);
    }

    this.setupUI();
  }

  async postChange(change, rollbackChange, undoLabel) {
    const undoRecord = {
      change: change,
      rollbackChange: rollbackChange,
      info: {
        label: undoLabel,
      },
    };

    this.undoStack.pushUndoRecord(undoRecord);
  }
}
