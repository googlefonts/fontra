import * as html from "/core/unlit.js";
import { css } from "../third-party/lit.js";
import Panel from "./panel.js";

export default class UserSettingsPanel extends Panel {
  name = "user-settings";
  icon = "/images/gear.svg";

  static styles = css`
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
}

customElements.define("panel-user-settings", UserSettingsPanel);
