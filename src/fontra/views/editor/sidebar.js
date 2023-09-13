import * as html from "/core/unlit.js";
import { clamp } from "../../core/utils.js";

export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 500;

export class Sidebar {
  constructor(identifier) {
    this.identifier = identifier;
    this.container = null;
    this.panels = [];
  }

  addPanel(panel) {
    if (!this.container) {
      throw new Error("Sidebar needs to be attached to a container element.");
    }

    this.panels.push(panel);

    const sidebarContainer = this.container.querySelector(
      `.sidebar-container.${this.identifier}`
    );

    const panelContent = html.div(
      { "class": "sidebar-content", "data-sidebarName": panel.identifier },
      [panel]
    );

    sidebarContainer.append(panelContent);

    const tabOverlayContainer = this.container.querySelector(
      `.tab-overlay-container.${this.identifier}`
    );

    tabOverlayContainer.appendChild(
      html.div(
        {
          "class": "sidebar-tab",
          "data-sidebarName": panel.identifier,
        },
        [
          html.createDomElement("inline-svg", {
            src: panel.iconPath,
          }),
        ]
      )
    );
  }

  toggle(tabName) {
    const container = document.querySelector(`.sidebar-container.${this.identifier}`);
    let toggledTab;
    for (const tab of this.panels) {
      const tabElement = document.querySelector(
        `.sidebar-tab[data-sidebar-name="${tab.identifier}"]`
      );
      const contentElement = document.querySelector(
        `.sidebar-content[data-sidebar-name="${tab.identifier}"]`
      );
      if (tabName === tab.identifier) {
        toggledTab = tabElement;
        const isSelected = tabElement.classList.contains("selected");
        tabElement.classList.toggle("selected", !isSelected);
        container.classList.toggle("visible", !isSelected);
        const shadowBox = document.querySelector(
          `.tab-overlay-container.${this.identifier} > .sidebar-shadow-box`
        );
        if (isSelected) {
          container.addEventListener(
            "transitionend",
            () => {
              contentElement.classList.remove("selected");
              shadowBox.classList.remove("visible");
            },
            { once: true }
          );
        } else {
          contentElement.classList.add("selected");
          shadowBox.classList.add("visible");
        }
      } else {
        tabElement.classList.remove("selected");
        contentElement.classList.remove("selected");
      }
    }
    return toggledTab.classList.contains("selected");
  }

  attach(element) {
    this.container = element;
    this.initResizeGutter();
  }

  applyWidth(width, saveLocalStorage = false) {
    if (saveLocalStorage) {
      localStorage.setItem(`fontra-sidebar-width-${this.identifier}`, width);
    }
    document.documentElement.style.setProperty(
      `--sidebar-content-width-${this.identifier}`,
      `${width}px`
    );
  }

  getStoredWidth() {
    const sidebarWidth = localStorage.getItem(
      `fontra-sidebar-width-${this.identifier}`
    );
    let width = clamp(parseInt(sidebarWidth), MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
    if (isNaN(width)) {
      width = MIN_SIDEBAR_WIDTH;
    }
    return width;
  }

  initResizeGutter() {
    let initialWidth;
    let initialPointerCoordinateX;
    let sidebarResizing;
    let growDirection;
    let width;
    const onPointerMove = (event) => {
      if (sidebarResizing) {
        let cssProperty;
        if (growDirection === "left") {
          width = initialWidth + (initialPointerCoordinateX - event.clientX);
          cssProperty = "--sidebar-content-width-right";
        } else {
          width = initialWidth + (event.clientX - initialPointerCoordinateX);
          cssProperty = "--sidebar-content-width-left";
        }
        width = clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        document.documentElement.style.setProperty(cssProperty, `${width}px`);
      }
    };
    const onPointerUp = () => {
      this.applyWidth(width, true);
      sidebarResizing.classList.add("animating");
      sidebarResizing = undefined;
      initialWidth = undefined;
      growDirection = undefined;
      initialPointerCoordinateX = undefined;
      document.documentElement.classList.remove("sidebar-resizing");
      document.removeEventListener("pointermove", onPointerMove);
    };
    const gutter = document.querySelector(
      `.sidebar-container.${this.identifier} .sidebar-resize-gutter`
    );
    gutter.addEventListener("pointerdown", (event) => {
      sidebarResizing = gutter.parentElement;
      initialWidth = sidebarResizing.getBoundingClientRect().width;
      initialPointerCoordinateX = event.clientX;
      sidebarResizing.classList.remove("animating");
      growDirection = gutter.dataset.growDirection;
      document.documentElement.classList.add("sidebar-resizing");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp, { once: true });
    });
    const sidebarWidth = this.getStoredWidth();
    if (sidebarWidth) {
      this.applyWidth(sidebarWidth);
    }
  }
}
