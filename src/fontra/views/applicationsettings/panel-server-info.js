import { BaseInfoPanel } from "./panel-base.js";

export class ServerInfoPanel extends BaseInfoPanel {
  static title = "application-settings.server-info.title";
  static id = "server-info-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
  }
}
