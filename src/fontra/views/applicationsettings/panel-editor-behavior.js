import { experimentalFeaturesController } from "../core/experimental-features.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { labeledCheckbox } from "../core/ui-utils.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
  .fontra-ui-editor-behavior-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

export class EditorBehaviorPanel extends BaseInfoPanel {
  static title = "application-settings.editor-behavior.title";
  static id = "editor-behavior-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    const container = html.createDomElement("div", {
      class: "fontra-ui-editor-behavior-panel-card",
    });

    container.appendChild(
      labeledCheckbox(
        "Rect-select live modifier keys",
        experimentalFeaturesController,
        "rectSelectLiveModifierKeys",
        {}
      )
    );
    this.panelElement.appendChild(container);
  }
}
