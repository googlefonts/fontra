import { loaderSpinner } from "../core/loader-spinner.js";
import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
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
      return { key: layer.identifier, displayName: layer.name, ui: "checkbox" };
    });
    items.push({
      displayName: translate("panel.settings.glyph"),
      controller: this.editorController.visualizationLayersSettings,
      descriptions: layerItems,
    });

    items.push({
      displayName: translate("panel.settings.clipboard"),
      controller: this.editorController.clipboardFormatController,
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
    });

    items.push({
      displayName: translate("panel.settings.experimental"),
      controller: this.editorController.experimentalFeaturesController,
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
      displayName: translate("panel.settings.theme"),
      controller: themeController,
      descriptions: [
        {
          key: "theme",
          ui: "radio",
          options: [
            {
              key: "automatic",
              displayName: translate("panel.settings.theme.auto"),
            },
            { key: "light", displayName: translate("panel.settings.theme.light") },
            { key: "dark", displayName: translate("panel.settings.theme.dark") },
          ],
        },
      ],
    });

    const serverInfo = await fetchJSON("/serverinfo");
    items.push({
      displayName: translate("panel.settings.server"),
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
