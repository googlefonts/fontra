import * as html from "../core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";

export class SourcesPanel extends BaseInfoPanel {
  static title = "sources.title";
  static id = "sources-panel";
  static fontAttributes = ["axes", "sources"];

  setupUI() {
    this.panelElement.appendChild(
      html.div({}, [`⚠️ under construction: placeholder for ${this.constructor.id}`])
    );
  }
}
