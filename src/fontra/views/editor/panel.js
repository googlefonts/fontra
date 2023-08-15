import { SimpleElement } from "/core/unlit.js";

export default class Panel extends SimpleElement {
  constructor(editorController) {
    super();
    this.editorController = editorController;
    this._attachStyles();
    this.contentElement = this.getContentElement();
    this.shadowRoot.appendChild(this.contentElement);
  }

  getContentElement() {}

  attach() {}

  detach() {}
}

customElements.define("fontra-panel", Panel);
