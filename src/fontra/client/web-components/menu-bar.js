import * as html from "../core/unlit.js";
import { SimpleElement } from "../core/unlit.js";

export class MenuBar extends SimpleElement {
  static styles = `
  .menu-bar {
    padding: 1rem;
    display: flex;
    align-items: center;
  }

  .dropdown-menu {
    position: relative;
    padding: 0.6rem 1rem;
    cursor: pointer;
    color: inherit;
    text-decoration: none;
  }

  .dropdown-menu:hover {
    background: white;
  }
  `;
  constructor(items = []) {
    super();
    this._items = items;
    this.contentElement = this.shadowRoot.appendChild(html.div());
    this.contentElement.classList.add("menu-bar");
    this.render();
  }
  set items(items) {
    this._items = items;
    this.render();
  }
  render() {
    const fragment = document.createDocumentFragment();
    for (const item of this._items) {
      fragment.appendChild(
        html.a(
          {
            class: "dropdown-menu",
            href: "#",
            onclick: (event) => event.preventDefault(),
          },
          [item.label]
        )
      );
    }
    this.contentElement.appendChild(fragment);
  }
}

customElements.define("menu-bar", MenuBar);
