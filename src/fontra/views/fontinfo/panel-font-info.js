import * as html from "../core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";

export class FontInfoPanel extends BaseInfoPanel {
  static title = "Font info";
  static id = "font-info-panel";

  async setupUI() {
    this.fontController = this.fontInfoController.fontController;
    const info = await this.fontController.getFontInfo();
    console.log(info);
    this.panelElement.innerHTML = "";
    this.panelElement.appendChild(html.div({}, ["hello"]));
  }
}
