import { SimpleElement } from "/core/html-utils.js";

export default class Panel extends SimpleElement {
  constructor(editorController) {
    super();
    this.editorController = editorController;
    this.contentElement = this.getContentElement();
    this.shadowRoot.appendChild(this.contentElement);
  }

  getContentElement() {}

  async toggle(on, focus) {}
}
