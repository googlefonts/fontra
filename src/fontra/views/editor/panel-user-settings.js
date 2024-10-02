import { loaderSpinner } from "../core/loader-spinner.js";
import Panel from "./panel.js";
import { applicationSettingsController } from "/core/application-settings.js";
import * as html from "/core/html-utils.js";
import { languageController, translate } from "/core/localization.js";
import { themeController } from "/core/theme-settings.js";
import { fetchJSON } from "/core/utils.js";

export default class UserSettingsPanel extends Panel {
  identifier = "user-settings";
  iconPath = "/images/gear.svg";

  static styles = `
    .sidebar-settings,
    .sidebar-layer-preferences {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: grid;
      gap: 1em;
      padding: 1em;
      grid-template-rows: auto 1fr;
    }
  `;

  getContentElement() {
    return html.div({ class: "sidebar-settings" }, [
      html.createDomElement("grouped-settings", {
        id: "user-settings",
      }),
    ]);
  }

  async toggle(on) {
    if (on && !this.editorController._didInitUserSettings) {
      this.editorController._didInitUserSettings = true;
      await loaderSpinner(this.setup());
    }
  }

  async setup() {
    const userSettings = this.contentElement.querySelector("#user-settings");
    const items = [];
    const layers = this.editorController.visualizationLayers.definitions.filter(
      (layer) => layer.userSwitchable
    );
    const layerItems = layers.map((layer) => {
      return {
        key: layer.identifier,
        displayName: translate(layer.name),
        ui: "checkbox",
      };
    });
    items.push({
      displayName: translate("sidebar.user-settings.glyph"),
      controller: this.editorController.visualizationLayersSettings,
      descriptions: layerItems,
    });

    items.push({
      displayName: translate("sidebar.user-settings.clipboard"),
      controller: applicationSettingsController,
      descriptions: [
        {
          key: "clipboardFormat",
          ui: "radio",
          options: [
            { key: "glif", displayName: "GLIF (RoboFont)" },
            { key: "svg", displayName: "SVG" },
            { key: "fontra-json", displayName: "JSON (Fontra)" },
          ],
        },
      ],
    });

    // TODO: refine as pop-up menu instead of radio buttons
    // TODO: add English language name in parentheses under other languages
    items.push({
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
    });

    items.push({
      displayName: translate("sidebar.user-settings.experimental"),
      controller: applicationSettingsController,
      descriptions: [
        {
          key: "scalingEditBehavior",
          displayName: "Scaling edit tool behavior",
          ui: "checkbox",
        },
        {
          key: "quadPenTool",
          displayName: "Pen tool draws quadratics",
          ui: "checkbox",
        },
        {
          key: "rectSelectLiveModifierKeys",
          displayName: "Rect-select live modifier keys",
          ui: "checkbox",
        },
      ],
    });

    items.push({
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
            { key: "dark", displayName: translate("sidebar.user-settings.theme.dark") },
          ],
        },
      ],
    });

    const serverInfo = await fetchJSON("/serverinfo");
    items.push({
      displayName: translate("sidebar.user-settings.server"),
      controller: null,
      descriptions: Object.entries(serverInfo).flatMap((entry) => {
        return [
          {
            displayName: entry[0] + ":",
            ui: "header",
          },
          {
            displayName: entry[1],
            ui: "plain",
          },
        ];
      }),
    });

    userSettings.items = items;
  }
}

customElements.define("panel-user-settings", UserSettingsPanel);
