import * as html from "../core/html-utils.js";
import { SimpleElement } from "../core/html-utils.js";
import { MenuPanel } from "./menu-panel.js";

export class MenuBar extends SimpleElement {
  static styles = `
  .menu-bar {
    padding: 0.5rem 1rem;
    align-items: center;
    position: absolute;
    font-size: 1rem;
  }

  .menu-item {
    padding: 0.5rem 1rem;
    display: inline-block;
    cursor: default;
    user-select: none;
  }

  .menu-item:hover,
  .menu-item.current {
    background: #e1e1e1;
    border-radius: 5px;
  }
  `;

  constructor(items = []) {
    super();
    this.items = items;
    this.contentElement = this.shadowRoot.appendChild(html.div());
    this.contentElement.classList.add("menu-bar");
    this.render();
    window.addEventListener("mousedown", this.clearCurrentSelection.bind(this));
    window.addEventListener("blur", this.clearCurrentSelection.bind(this));
  }

  clearCurrentSelection() {
    const currentSelection = this.contentElement.querySelector(".current");
    if (!currentSelection) {
      return false;
    }
    currentSelection.classList.remove("current");
    const menuPanel = this.contentElement.querySelector("menu-panel");
    if (menuPanel) {
      this.contentElement.removeChild(menuPanel);
    }
    return true;
  }

  showMenu(items, menuItemElement) {
    menuItemElement.classList.add("current");
    const clientRect = menuItemElement.getBoundingClientRect();
    const menuPanel = new MenuPanel(items, {
      x: clientRect.x,
      y: clientRect.y + clientRect.height,
    });
    this.contentElement.appendChild(menuPanel);
  }

  render() {
    const fragment = document.createDocumentFragment();
    for (const item of this.items) {
      const menuItem = html.div(
        {
          onmouseover: () => {
            if (this.clearCurrentSelection()) {
              this.showMenu(item.items, menuItem);
            }
          },
          onclick: () => {
            this.clearCurrentSelection();
            this.showMenu(item.items, menuItem);
          },
          class: "menu-item",
        },
        [item.title]
      );
      fragment.appendChild(menuItem);
    }
    this.contentElement.appendChild(fragment);
  }
}

customElements.define("menu-bar", MenuBar);
