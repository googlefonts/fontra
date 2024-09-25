import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { languageController, translate } from "../core/localization.js";
import { themeController } from "../core/theme-settings.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
  .fontra-ui-user-settings-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

export class UserSettingsPanel extends BaseInfoPanel {
  static title = "application-settings.user-settings.title";
  static id = "user-settings-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    this.panelElement.style = "gap: 1em;";

    for (const cardContent of this.cards()) {
      const container = html.createDomElement("grouped-settings", {
        id: "user-settings",
      });
      container.className = "fontra-ui-user-settings-panel-card";
      container.items = [cardContent];
      this.panelElement.appendChild(container);
    }
  }

  cards() {
    return [
      {
        displayName: translate("sidebar.user-settings.theme"),
        controller: themeController,
        descriptions: [
          {
            key: "theme",
            ui: "radio",
            options: [
              {
                key: "automatic",
                displayName: translate("sidebar.user-settings.theme.auto"),
              },
              {
                key: "light",
                displayName: translate("sidebar.user-settings.theme.light"),
              },
              {
                key: "dark",
                displayName: translate("sidebar.user-settings.theme.dark"),
              },
            ],
          },
        ],
      },
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
      // {
      //   displayName: translate("sidebar.user-settings.clipboard"),
      //   controller: this.editorController.clipboardFormatController,
      //   descriptions: [
      //     {
      //       key: "format",
      //       ui: "radio",
      //       options: [
      //         { key: "glif", displayName: "GLIF (RoboFont)" },
      //         { key: "svg", displayName: "SVG" },
      //         { key: "fontra-json", displayName: "JSON (Fontra)" },
      //       ],
      //     },
      //   ],
      // }
    ];
  }
}
