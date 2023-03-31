import { UnlitElement, div } from "/core/unlit.js";
import { SimpleSettings } from "./simple-settings.js";

export class GroupedSettings extends UnlitElement {
  static styles = `
    :host {
      overflow-y: scroll;
    }

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
      return [div({ class: "header" }, [item.displayName]), simpleSettings];
    });
  }
}

customElements.define("grouped-settings", GroupedSettings);
