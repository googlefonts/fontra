export class InlineSVG extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return ["src"];
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
    this.innerHTML = await response.text();
  }
}

customElements.define("inline-svg", InlineSVG);
