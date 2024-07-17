import { InlineSVG } from "./inline-svg.js";
import { themeColorCSS } from "./theme-support.js";
import { SVGPath2D } from "/core/glyph-svg.js";
import * as html from "/core/html-utils.js";
import { UnlitElement } from "/core/html-utils.js";
import * as svg from "/core/svg-utils.js";
import { Transform } from "/core/transform.js";
import { getCharFromCodePoint, rgbaToCSS, throttleCalls } from "/core/utils.js";

const colors = {
  "cell-background-color": ["#EEE", "#383838"],
  "cell-hover-color": ["#D8D8D8", "#303030"],
  "cell-active-color": ["#D0D0D0", "#282828"],
};

export class GlyphCell extends UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

  #glyph-cell-container {
    background-color: var(--cell-background-color);
    display: inline-block;
    margin: 1px;
    border-radius: 0.3rem;
    overflow: hidden;
    transition: 100ms;
  }

  #glyph-cell-container:hover {
    background-color: var(--cell-hover-color);
  }

  #glyph-cell-container:active {
    background-color: var(--cell-active-color);
  }

  #glyph-cell-content {
    display: grid;
    justify-items: center;
    gap: 0;
  }

  .glyph-name-label {
    font-size: 0.85em;
    padding-left: 0.3em;
    padding-right: 0.3em;
  }

  .glyph-status-color {
    height: 0.3rem;
    justify-self: stretch;
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

  connectedCallback() {
    super.connectedCallback();
    this.locationController.addKeyListener(this.locationKey, this.throttledUpdate);
    this.fontController.addGlyphChangeListener(this.glyphName, this.throttledUpdate);
    this._updateGlyph();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.locationController.removeKeyListener(this.locationKey, this.throttledUpdate);
    this.fontController.removeGlyphChangeListener(this.glyphName, this.throttledUpdate);
  }

  async _updateGlyph() {
    const location = this.locationController.model[this.locationKey];
    const varGlyph = await this.fontController.getGlyph(this.glyphName);
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

    this._glyphStatusColor = getStatusColor(
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"],
      varGlyph,
      glyphController.sourceIndex
    );
    this._glyphSVG = svgElement;
    this.requestUpdate();
  }

  render() {
    this._glyphCellContent = html.div({ id: "glyph-cell-container" }, [
      html.div({ id: "glyph-cell-content" }, [
        this._glyphSVG ? this._glyphSVG : `loading ${this.glyphName}`,
        html.span({ class: "glyph-name-label" }, [this.glyphName]),
        html.div(
          {
            class: "glyph-status-color",
            style: `background-color: ${this._glyphStatusColor};`,
          },
          []
        ),
      ]),
    ]);
    return this._glyphCellContent;
  }
}

function getStatusColor(statusFieldDefinitions, varGlyph, sourceIndex) {
  let statusColor = "var(--cell-background-color)";
  if (!statusFieldDefinitions || sourceIndex === undefined) {
    return statusColor;
  }

  let status = varGlyph.sources[sourceIndex].customData["fontra.development.status"];
  if (status === undefined) {
    status = statusFieldDefinitions.find((statusDef) => statusDef.isDefault)?.value;
  }

  const color = statusFieldDefinitions[status]?.color;
  if (color) {
    statusColor = rgbaToCSS(color);
  }

  return statusColor;
}

customElements.define("glyph-cell", GlyphCell);
