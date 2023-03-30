import { UnlitElement, createDomElement as element } from "/core/unlit.js";
import { SimpleSettings } from "./simple-settings.js";

export class GroupedSettings extends UnlitElement {
  static styles = `
    .header {
      margin-top: 0.6em;
      margin-bottom: 0.2em;
      font-weight: bold;
    }
  `;

  get items() {
    return this._items;
  }
  set items(items) {
    this._items = items;
    this.requestUpdate();
  }

  render() {
    if (!this._items) {
      return;
    }
    return this.items.map((item) => {
      const simpleSettings = new SimpleSettings();
      simpleSettings.model = item.model;
      simpleSettings.descriptions = item.descriptions;
      const elements = [
        element("div", { class: "header" }, [item.displayName]),
        simpleSettings,
      ];
      return elements;
    });
  }
}

customElements.define("grouped-settings", GroupedSettings);
