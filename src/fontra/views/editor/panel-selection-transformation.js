import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { scalePoint } from "/core/path-functions.js";
import { findNestedActiveElement } from "/core/utils.js";

export default class SelectionTransformationPanel extends Panel {
  identifier = "selection-transformation";
  iconPath = "/tabler-icons/shape.svg";

  static styles = `
    .sidebar-text-entry {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      padding: 1em;
    }

    #text-align-menu {
      display: grid;
      grid-template-columns: auto auto auto;
      justify-content: start;
      gap: 0.5em;
    }

    #text-align-menu > inline-svg {
      width: 1.5rem;
      height: 1.5rem;
      position: relative;
      padding: 0.3em 0.45em 0.3em 0.45em;
      border-radius: 0.75em;
      cursor: pointer;
      user-select: none;
      transition: 120ms;
    }

    #text-align-menu > inline-svg:hover {
      background-color: #c0c0c050;
    }

    #text-align-menu > inline-svg:active {
      background-color: #c0c0c080;
    }

    #text-align-menu > inline-svg.selected {
      background-color: #c0c0c060;
    }

    #text-entry-textarea {
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      border-radius: 0.25em;
      border: 0.5px solid lightgray;
      outline: none;
      padding: 0.2em 0.5em;
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1.1rem;
      resize: none;
      overflow-x: auto;
    }
  `;

  constructor(editorController) {
    super(editorController);

    //this.textSettingsController = this.editorController.sceneSettingsController;
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    //this.setupTextAlignElement();
  }

  getContentElement() {
    return html.div(
      {
        class: "selection-transformation",
      },
      []
    );
  }

  /*   getContentElement() {
    return html.div(
      {
        class: "sidebar-text-entry",
      },
      [
        html.div(
          {
            id: "text-align-menu",
          },
          [
            html.createDomElement("inline-svg", {
              "data-align": "left",
              "src": "/images/alignleft.svg",
            }),
            html.createDomElement("inline-svg", {
              "class": "selected",
              "data-align": "center",
              "src": "/images/aligncenter.svg",
            }),
            html.createDomElement("inline-svg", {
              "data-align": "right",
              "src": "/images/alignright.svg",
            }),
          ]
        ),
      ]
    );
  } */

  updateAlignElement(align) {
    for (const el of this.textAlignElement.children) {
      el.classList.toggle("selected", align === el.dataset.align);
    }
  }

  setupTextAlignElement() {
    this.textAlignElement = this.contentElement.querySelector("#text-align-menu");
    this.updateAlignElement(this.textSettings.align);

    this.textSettingsController.addKeyListener("align", (event) => {
      this.updateAlignElement(this.textSettings.align);
    });

    for (const el of this.textAlignElement.children) {
      el.onclick = (event) => {
        if (event.target.classList.contains("selected")) {
          return;
        }
        this.textSettings.align = el.dataset.align;
      };
    }
  }

  async toggle(on, focus) {
    if (focus) {
      this.focusTextEntry();
    }
  }
}

customElements.define("panel-selection-transformation", SelectionTransformationPanel);
