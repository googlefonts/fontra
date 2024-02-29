import * as html from "../core/html-utils.js";
import { SimpleElement } from "../core/html-utils.js";
import { MenuPanel } from "./menu-panel.js";

export class MenuBar extends SimpleElement {
  static styles = `
  .menu-bar {
    padding: 0.2rem 0.5rem;
    align-items: center;
    position: absolute;
    font-size: 1rem;
    width: 100%;
  }

  .menu-item {
    padding: 0.4rem 0.6rem;
    display: inline-block;
    cursor: default;
    user-select: none;
  }

  .menu-item:hover,
  .menu-item.current {
    background: var(--editor-top-bar-link-hover);
    border-radius: 5px;
  }
  `;

  constructor(items = []) {
    super();
    this.items = items;
    this.contentElement = this.shadowRoot.appendChild(html.div());
    this.contentElement.classList.add("menu-bar");
    this.render();
    window.addEventListener("mousedown", this.onBlur.bind(this));
    window.addEventListener("blur", this.onBlur.bind(this));
    this.contentElement.addEventListener("mouseover", this.onMouseover.bind(this));
    this.contentElement.addEventListener("click", this.onClick.bind(this));
    this.contentElement.addEventListener("keydown", this.handleKeyDown.bind(this));
    this.showMenuWhenHover = false;
  }

  onClick(event) {
    if (event.target.classList.contains("menu-item")) {
      const currentSelection = this.contentElement.querySelector(".current");
      if (currentSelection === event.target) {
        this.clearCurrentSelection();
        this.showMenuWhenHover = false;
      } else {
        for (let i = 0; i < this.contentElement.childElementCount; i++) {
          const node = this.contentElement.childNodes[i];
          if (node === event.target) {
            this.clearCurrentSelection();
            this.showMenuWhenHover = true;
            this.showMenu(this.items[i].getItems(), node);
            break;
          }
        }
      }
    }
  }

  onMouseover(event) {
    const currentSelection = this.contentElement.querySelector(".current");
    if (!currentSelection && !this.showMenuWhenHover) {
      return;
    }
    if (event.target === this.contentElement) {
      this.clearCurrentSelection();
      this.showMenuWhenHover = true;
      return;
    }
    if (event.target.classList.contains("menu-item")) {
      this.clearCurrentSelection();
      for (let i = 0; i < this.contentElement.childElementCount; i++) {
        const node = this.contentElement.childNodes[i];
        if (node === event.target) {
          if (this.showMenuWhenHover) {
            this.showMenu(this.items[i].getItems(), node);
          }
          break;
        }
      }
    }
  }

  onBlur(event) {
    this.clearCurrentSelection();
    this.showMenuWhenHover = false;
  }

  clearCurrentSelection(event) {
    const currentSelection = this.contentElement.querySelector(".current");
    if (currentSelection) {
      currentSelection.classList.remove("current");
      const menuPanel = this.contentElement.querySelector("menu-panel");
      if (menuPanel) {
        this.contentElement.removeChild(menuPanel);
      }
    }
  }

  showMenu(items, menuItemElement) {
    menuItemElement.classList.add("current");
    const clientRect = menuItemElement.getBoundingClientRect();
    const position = {
      x: clientRect.x,
      y: clientRect.y + clientRect.height,
    };
    const menuPanel = new MenuPanel(items, {
      position,
      onSelect: () => {
        this.showMenuWhenHover = false;
        this.clearCurrentSelection();
      },
      onClose: () => {
        this.showMenuWhenHover = false;
        this.clearCurrentSelection();
      },
    });
    this.contentElement.appendChild(menuPanel);
  }

  handleKeyDown(event) {
    event.stopImmediatePropagation();
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        this.navigateMenuBar(event.key);
        break;
    }
  }

  navigateMenuBar(arrowKey) {
    const currentSelection = this.contentElement.querySelector(".current");
    const menuItemElements = this.contentElement.children;
    const currentSelectionIndex = Array.prototype.indexOf.call(
      menuItemElements,
      currentSelection
    );
    let newSelectionIndex;
    arrowKey == "ArrowLeft"
      ? (newSelectionIndex = currentSelectionIndex - 1)
      : (newSelectionIndex = currentSelectionIndex + 1);

    if (menuItemElements[newSelectionIndex]?.classList.contains("menu-item")) {
      this.clearCurrentSelection();
      this.showMenuWhenHover = true;
      this.showMenu(
        this.items[newSelectionIndex].getItems(),
        menuItemElements[newSelectionIndex]
      );
    }
  }

  render() {
    const fragment = document.createDocumentFragment();
    for (const item of this.items) {
      fragment.appendChild(
        html.div(
          {
            class: "menu-item",
            onmousedown: (event) => {
              const currentSelection = this.contentElement.querySelector(".current");
              if (currentSelection === event.target) {
                event.stopImmediatePropagation();
              }
            },
          },
          [item.title]
        )
      );
    }
    this.contentElement.appendChild(fragment);
  }
}

customElements.define("menu-bar", MenuBar);
