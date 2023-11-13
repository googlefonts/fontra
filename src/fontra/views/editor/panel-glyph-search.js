import Panel from "./panel.js";
import * as html from "/core/html-utils.js";

export default class GlyphSearchPanel extends Panel {
  identifier = "glyph-search";
  iconPath = "/images/magnifyingglass.svg";

  static styles = `
    .glyph-search {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: grid;
      gap: 1em;
      padding: 1em;
    }
  `;

  getContentElement() {
    return html.div(
      {
        class: "glyph-search",
      },
      [
        html.createDomElement("glyphs-search", {
          id: "glyphs-search",
        }),
      ]
    );
  }

  async toggle(on, focus) {
    if (on && focus) {
      const glyphsSearch = this.contentElement.querySelector("#glyphs-search");
      glyphsSearch.focusSearchField();
    }
  }
}

customElements.define("panel-glyph-search", GlyphSearchPanel);
