import { clipboardFormatController } from "../core/clipboard-format.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { translate } from "../core/localization.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
  .fontra-ui-clipboard-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

export class ClipboardPanel extends BaseInfoPanel {
  static title = "application-settings.clipboard.title";
  static id = "clipboard-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    this.panelElement.style = "gap: 1em;";

    for (const cardContent of this.cards()) {
      const container = html.createDomElement("grouped-settings", {
        class: "fontra-ui-clipboard-panel-card",
      });
      container.items = [cardContent];
      this.panelElement.appendChild(container);
    }
  }

  cards() {
    return [
      {
        displayName: translate("sidebar.user-settings.clipboard"),
        controller: clipboardFormatController,
        descriptions: [
          {
            key: "format",
            ui: "radio",
            options: [
              { key: "glif", displayName: "GLIF (RoboFont)" },
              { key: "svg", displayName: "SVG" },
              { key: "fontra-json", displayName: "JSON (Fontra)" },
            ],
          },
        ],
      },
    ];
  }
}