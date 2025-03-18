import * as html from "@fontra/core/html-utils.js";
import { SimpleElement } from "@fontra/core/html-utils.js";
import { sleepAsync } from "@fontra/core/utils.js";
import { MenuPanel } from "./menu-panel.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "menu-bar-link-hover": ["#e1e1e1", "rgb(47, 47, 47)"],
};

export class MenuBar extends SimpleElement {
  static styles = `

  ${themeColorCSS(colors)}

  .menu-bar {
    display: flex;
    align-items: center;
    font-size: 1rem;
    height: 100%;
    padding: 0 0.5rem;
  }

  .menu-item {
    padding: 0.4rem 0.6rem;
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
  }

  .menu-item:focus-visible {
    outline: none;
  }

  .menu-item:focus-visible,
  .menu-item.hovered,
  .menu-item.current {
    background: var(--menu-bar-link-hover);
    border-radius: 5px;
  }

  .menu-item-bold {
    font-weight: bold;
  }
  `;

  constructor(items = []) {
    super();
    this.items = items;
    this.contentElement = this.shadowRoot.appendChild(html.div());
    this.contentElement.classList.add("menu-bar");
    this.render();
    window.addEventListener("blur", this.closeMenu.bind(this));
    window.addEventListener("menu-panel:close", this.closeMenu.bind(this));
    window.addEventListener("keydown", this.onKeyDown.bind(this));
    this.contentElement.addEventListener("mouseover", this.onMouseOver.bind(this));
    this.contentElement.addEventListener(
      "mouseleave",
      this.unhoverMenuItems.bind(this)
    );
    this.contentElement.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.showMenuWhenHover = false;
  }

  get currentSelection() {
    return this.contentElement.querySelector(".current");
  }

  get menuPanel() {
    return this.contentElement.querySelector("menu-panel");
  }

  get submenuPanel() {
    return this.menuPanel?.submenu;
  }

  onMouseDown(event) {
    const { target } = event;
    if (isMenuItem(target)) {
      if (!this.menuPanel) {
        this.openMenu(target);
      } else {
        this.closeMenu();
      }
    }
  }

  onMouseOver(event) {
    this.hoverMenuItem(event);

    if (!this.currentSelection && !this.showMenuWhenHover) {
      return;
    }

    if (event.target === this.contentElement) {
      this.clearCurrentSelection();
      this.showMenuWhenHover = true;
      return;
    }
    if (isMenuItem(event.target)) {
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

  hoverMenuItem(event) {
    this.unhoverMenuItems();
    const hoveredItem = event.target;
    if (!isMenuItem(hoveredItem)) {
      return;
    }
    hoveredItem.classList.add("hovered");
  }

  unhoverMenuItems() {
    for (const item of this.contentElement.children) {
      item.classList.remove("hovered");
    }
  }

  clearCurrentSelection() {
    if (this.currentSelection) {
      this.currentSelection.classList.remove("current");
      const { menuPanel } = this;
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
      immediatelyActive: false,
      context: "menu-bar",
      onSelect: () => this.closeMenu(),
      onClose: () => this.closeMenu(),
    });
    this.contentElement.appendChild(menuPanel);
  }

  openMenu(target) {
    const { contentElement } = this;
    if (contentElement.querySelector(".current") !== target) {
      for (let i = 0; i < contentElement.childElementCount; i++) {
        const node = contentElement.childNodes[i];
        if (node === target) {
          this.clearCurrentSelection();
          this.showMenuWhenHover = true;
          this.showMenu(this.items[i].getItems(), node);
          break;
        }
      }
    }
  }

  closeMenu() {
    this.clearCurrentSelection();
    this.showMenuWhenHover = false;
    this.shadowRoot.activeElement?.blur();
  }

  async onKeyDown(event) {
    const { submenuPanel } = this;
    let { menuPanel } = this;
    switch (event.key) {
      case "ArrowLeft":
        if (!submenuPanel || menuPanel.active) {
          this.navigateMenuBar(-1);
        }
        break;
      case "ArrowRight":
        if (!submenuPanel || submenuPanel.active) {
          this.navigateMenuBar(+1);
        }
        break;
      case "ArrowDown":
        const { activeElement } = this.shadowRoot;
        if (isMenuItem(activeElement) && !menuPanel) {
          this.openMenu(activeElement);
          await sleepAsync(0);
        }
        menuPanel = this.menuPanel;
        if (menuPanel && !menuPanel.selectedItem && !menuPanel.submenu) {
          menuPanel.selectFirstEnabledItem(menuPanel.menuElement.children);
        }
        break;
    }
  }

  navigateMenuBar(direction) {
    if (!this.currentSelection) {
      return;
    }

    this.unhoverMenuItems();
    const { children } = this.contentElement;
    const currentSelectionIndex = Array.prototype.indexOf.call(
      children,
      this.currentSelection
    );
    const newSelectionIndex = currentSelectionIndex + direction;

    if (isMenuItem(children[newSelectionIndex])) {
      children[newSelectionIndex].focus();
      this.clearCurrentSelection();
      this.showMenuWhenHover = true;
      this.showMenu(
        this.items[newSelectionIndex].getItems(),
        children[newSelectionIndex]
      );
    }
  }

  render() {
    const fragment = document.createDocumentFragment();
    for (const item of this.items) {
      fragment.appendChild(
        html.div(
          {
            class: item.bold ? "menu-item menu-item-bold" : "menu-item",
            tabIndex: 0,
          },
          [item.title]
        )
      );
    }
    this.contentElement.appendChild(fragment);
  }
}

customElements.define("menu-bar", MenuBar);

function isMenuItem(target) {
  return target?.classList.contains("menu-item");
}
