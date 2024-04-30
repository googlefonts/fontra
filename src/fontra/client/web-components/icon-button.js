import { InlineSVG } from "./inline-svg.js";
import * as html from "/core/html-utils.js";
import { UnlitElement } from "/core/html-utils.js";

export class IconButton extends UnlitElement {
  static styles = `
    button {
      background-color: transparent;
      border: none;
      padding: 0;
      margin: 0;
      color: var(--foreground-color);
      width: 100%;
      height: 100%;
      transition: 150ms;
    }

    button:hover {
      transform: scale(1.1, 1.1);
    }

    button:active {
      transform: scale(1.2, 1.2);
    }

    button:disabled {
      opacity: 35%;
      transform: none;
    }

  `;

  constructor(src) {
    super();
    if (src) {
      this.setAttribute("src", src);
    }
  }

  static properties = {
    src: { type: String },
  };

  get disabled() {
    return this._buttonDisabled;
  }

  set disabled(value) {
    this._buttonDisabled = value;
    if (this._button) {
      this._button.disabled = value;
    }
  }

  set onclick(callback) {
    // Don't assign this.onclick, we only need button.onclick
    this._buttonOnClick = callback;
  }

  render() {
    const svgContent = html.createDomElement("inline-svg", { src: this.src });
    if (this.id) {
      svgContent.id = this.id;
    }
    this._button = html.button(
      { onclick: this._buttonOnClick, disabled: this._buttonDisabled },
      [svgContent]
    );
    return this._button;
  }
}

customElements.define("icon-button", IconButton);
