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

  `;

  constructor(src) {
    super();
    if (src) {
      this.setAttribute("src", src);
    }
  }

  static get observedAttributes() {
    return ["src", "disabled"];
  }

  // get src() {
  //   return this.getAttribute("src");
  // }

  // set src(value) {
  //   return this.setAttribute("src", value);
  // }

  attributeChangedCallback(name, oldValue, newValue) {
    this.requestUpdate();
  }

  render() {
    console.log("heyyy, disa", this.disabled, typeof this.disabled);
    // console.log("heyyy, disa2", this.disabled, typeof this.disabled);
    const content = html.button({ onclick: this.onclick, disabled: this.disabled }, [
      html.createDomElement("inline-svg", { src: this.src }),
    ]);
    return content;
  }
}

customElements.define("icon-button", IconButton);
