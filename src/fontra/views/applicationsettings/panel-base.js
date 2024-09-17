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
}
