import { UnlitElement } from "/core/unlit.js";
import * as html from "/core/unlit.js";
import { InlineSVG } from "./inline-svg.js";

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

    [title] {
      position: relative;
      cursor: default;
    }

    [title]:hover::before {
      content: attr(title);
      font-size: 10px;
      text-align: center;
      position: absolute;
      display: block;
      left: 200%;
      bottom: calc(100% + 6px);
      transform: translate(-50%);
      /* disable when reduced-motion */
      animation: fade-in 300ms ease;
      background: #272727;
      border-radius: 4px;
      padding: 8px;
      color: #ffffff;
      z-index: 1;
    }

    [title]:hover::after {
      content: "";
      position: absolute;
      display: block;
      left: 50%;
      width: 0;
      height: 0;
      bottom: calc(100% + 2px);
      margin-left: -6px;
      border: 1px solid black;
      border-color: #272727 transparent transparent transparent;
      border-width: 4px 6px 0;
      /* disable when reduced-motion */
      animation: fade-in 300ms ease;
      z-index: 1;
    }

    /* disable when reduced-motion */
    @keyframes fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
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
    title: { type: String },
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
    this._button = html.button(
      {
        onclick: this._buttonOnClick,
        disabled: this._buttonDisabled,
        title: this.title,
      },
      [html.createDomElement("inline-svg", { src: this.src })]
    );
    return this._button;
  }
}

customElements.define("icon-button", IconButton);
