import { ObservableController } from "../core/observable-object.js";
import * as html from "../core/unlit.js";
import { SimpleElement } from "../core/unlit.js";

export class PluginList extends SimpleElement {
  static styles = `
  .plugin-list {
    display: grid;
    grid-template-columns: auto min-content;
    margin: 1rem;
  }
  `;
  constructor() {
    super();
    this.contentElement = this.shadowRoot.appendChild(document.createElement("div"));
    this.contentElement.classList.add("plugin-list");
    this.observable = new ObservableController({
      plugins: ["fatih-erikli/fontra-plugin-demo"],
    });
    this.observable.synchronizeWithLocalStorage("fontra.plugins");
    this.observable.addKeyListener("plugins", (...args) => {
      console.log(args);
    });
    this.renderPlugins();
  }

  renderPlugins() {
    const fragment = document.createDocumentFragment();
    for (const plugin of this.observable.model.plugins) {
      fragment.appendChild(
        html.div(
          {
            class: "plugin-name",
          },
          [plugin]
        )
      );
      fragment.appendChild(
        html.div(
          {
            class: "plugin-buttons",
          },
          [
            html.button(
              {
                onclick: () => {
                  if (
                    window.confirm("This action is irreversible. Press OK to continue.")
                  ) {
                    alert("delete");
                  }
                },
              },
              ["Delete"]
            ),
          ]
        )
      );
    }
    this.contentElement.appendChild(fragment);
  }
}

customElements.define("plugin-list", PluginList);
