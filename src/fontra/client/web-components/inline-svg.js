// This isn't really a web component, just a custom element.

import { htmlToElement } from "/core/utils.js";

export class InlineSVG extends HTMLElement {
  constructor(src) {
    super();
    if (src) {
      this.setAttribute("src", src);
    }
  }

  static get observedAttributes() {
    return ["src"];
  }

  get src() {
    return this.getAttribute("src");
  }

  set src(value) {
    return this.setAttribute("src", value);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "src") {
      if (newValue) {
        this.fetchSVG(newValue);
      } else {
        this.innerHTML = "";
      }
    }
  }

  async fetchSVG(svgSRC) {
    const response = await fetch(svgSRC);
    const svgElement = htmlToElement(await response.text());
    svgElement.removeAttribute("width");
    svgElement.removeAttribute("height");
    this.innerHTML = "";
    this.appendChild(svgElement);
  }
}

customElements.define("inline-svg", InlineSVG);
