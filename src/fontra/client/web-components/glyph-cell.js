import { InlineSVG } from "./inline-svg.js";
import { SVGPath2D } from "/core/glyph-svg.js";
import * as html from "/core/html-utils.js";
import { UnlitElement } from "/core/html-utils.js";
import * as svg from "/core/svg-utils.js";
import { Transform } from "/core/transform.js";
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
    this.throttledUpdate = throttleCalls(() => this._updateGlyph(), 50);
  }

  static properties = {
    _glyphSVG: {},
  };

  connectedCallback() {
    super.connectedCallback();
    this.locationController.addKeyListener(this.locationKey, this.throttledUpdate);
    this._updateGlyph();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.locationController.removeKeyListener(this.locationKey, this.throttledUpdate);
  }

  async _updateGlyph() {
    const location = this.locationController.model[this.locationKey];
    const glyphController = await this.fontController.getGlyphInstance(
      this.glyphName,
      location
    );
    if (!glyphController) {
      this._glyphSVG = null;
      return;
    }

    const unitsPerEm = this.fontController.unitsPerEm;
    const fontSource = this.fontController.fontSourcesInstancer.instantiate(location);
    const ascender =
      fontSource.lineMetricsHorizontalLayout["ascender"]?.value || 0.8 * unitsPerEm;
    const descender =
      fontSource.lineMetricsHorizontalLayout["descender"]?.value || -0.2 * unitsPerEm;

    const svgPath = new SVGPath2D();
    glyphController.flattenedPath.drawToPath2d(svgPath);

    const margin = 0.05;
    const size = 80;
    const height = (1 + 2 * margin) * size;
    const width = ((1 + 2 * margin) * size * glyphController.xAdvance) / unitsPerEm;

    const svgElement = svg.svg(
      {
        viewBox: svg.viewBox(
          -margin * unitsPerEm,
          -(ascender + margin * unitsPerEm),
          glyphController.xAdvance + 2 * margin * unitsPerEm,
          ascender - descender + 2 * margin * unitsPerEm
        ),
        width,
        height,
      },
      [
        svg.path({
          d: svgPath.getPath(),
          transform: new Transform(1, 0, 0, -1, 0, 0),
        }),
      ]
    );
    this._glyphSVG = svgElement;
  }

  render() {
    this._glyphCellContent = html.div({ id: "glyph-cell-content" }, [
      this._glyphSVG ? this._glyphSVG : `loading ${this.glyphName}`,
    ]);
    return this._glyphCellContent;
  }
}

customElements.define("glyph-cell", GlyphCell);
