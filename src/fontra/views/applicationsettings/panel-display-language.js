import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { languageController } from "../core/localization.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
  .fontra-ui-display-language-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

export class DisplayLanguagePanel extends BaseInfoPanel {
  static title = "application-settings.display-language.title";
  static id = "display-language-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    this.panelElement.style = "gap: 1em;";

    for (const cardContent of this.cards()) {
      const container = html.createDomElement("grouped-settings", {
        class: "fontra-ui-display-language-panel-card",
      });
      container.items = [cardContent];
      this.panelElement.appendChild(container);
    }
  }

  cards() {
    return [
      {
        displayName: "Display Language",
        controller: languageController,
        descriptions: [
          {
            key: "language",
            ui: "radio",
            options: [
              { key: "en", displayName: "English" },
              { key: "zh-CN", displayName: "Simplified Chinese" },
            ],
          },
        ],
      },
    ];
  }
}
