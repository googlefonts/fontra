import { InlineSVG } from "./inline-svg.js";
import * as html from "/core/html-utils.js";
import { UnlitElement } from "/core/html-utils.js";
import { getCharFromCodePoint, throttleCalls } from "/core/utils.js";

export class GlyphCell extends UnlitElement {
  static styles = `
  :host {
    background-color: #EEE;
    display: inline-block;
    margin: 1px;
    border-radius: 0.2rem;
    // height: 3rem;
  }
  `;

  constructor(fontController, glyphName, locationController, locationKey) {
    super();
    this.fontController = fontController;
    this.glyphName = glyphName;
    this.locationController = locationController;
    this.locationKey = locationKey;
  }

  static properties = {
    _glyphSVG: {},
  };

  connectedCallback() {
    super.connectedCallback();
    // console.log("connected", this.glyphName);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    // console.log("disconnected", this.glyphName);
  }

  render() {
    this._glyphCellContent = html.div(
      { id: "glyph-cell-content", style: "height: 4rem;" },
      [this._glyphSVG ? this._glyphSVG : `loading ${this.glyphName}`]
    );
    return this._glyphCellContent;
  }
}

customElements.define("glyph-cell", GlyphCell);
