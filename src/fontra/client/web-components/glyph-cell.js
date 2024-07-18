import { InlineSVG } from "./inline-svg.js";
import { themeColorCSS } from "./theme-support.js";
import { SVGPath2D } from "/core/glyph-svg.js";
import * as html from "/core/html-utils.js";
import { UnlitElement } from "/core/html-utils.js";
import * as svg from "/core/svg-utils.js";
import { Transform } from "/core/transform.js";
import { getCharFromCodePoint, rgbaToCSS, throttleCalls } from "/core/utils.js";

const colors = {
  "cell-background-color": ["#EEE", "#585858"],
  "cell-hover-color": ["#D8D8D8", "#606060"],
  "cell-active-color": ["#D0D0D0", "#686868"],
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
    cursor: pointer;
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
    overflow-x: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }

  .glyph-status-color {
    height: 0.3rem;
    justify-self: stretch;
  }
  `;

  constructor(fontController, glyphName, codePoints, locationController, locationKey) {
    super();
    this.fontController = fontController;
    this.glyphName = glyphName;
    this.codePoints = codePoints;
    this.locationController = locationController;
    this.locationKey = locationKey;
    this.throttledUpdate = throttleCalls(() => this._updateGlyph(), 50);
    this.marginTop = 0.2;
    this.marginBottom = 0.05;
    this.marginSide = 0;
    this.size = 60;
    this.height = (1 + this.marginTop + this.marginBottom) * this.size;
    this.width = this.height;
  }

  connectedCallback() {
    super.connectedCallback();

    const observer = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio > 0) {
            this.locationController.addKeyListener(
              this.locationKey,
              this.throttledUpdate
            );
            this.fontController.addGlyphChangeListener(
              this.glyphName,
              this.throttledUpdate
            );
            this.throttledUpdate();
          } else {
            this.locationController.removeKeyListener(
              this.locationKey,
              this.throttledUpdate
            );
            this.fontController.removeGlyphChangeListener(
              this.glyphName,
              this.throttledUpdate
            );
          }
        });
      },
      {
        root: this.parentElement,
        // Somehow out cell is only seen as intersecting if the glyph name / status
        // color is visible. Let's take the cell height as addition bottom root margin.
        rootMargin: `0px 0px ${this.height}px 0px`, // (top, right, bottom, left).
      }
    );
    observer.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.locationController.removeKeyListener(this.locationKey, this.throttledUpdate);
    this.fontController.removeGlyphChangeListener(this.glyphName, this.throttledUpdate);
  }

  async _updateGlyph() {
    this.width = this.height;
    const location = this.locationController.model[this.locationKey];
    const glyphController = await this.fontController.getGlyphInstance(
      this.glyphName,
      location
    );
    if (!glyphController) {
      this._glyphSVG = null;
      return;
    }
    const varGlyph = glyphController.varGlyph;

    const unitsPerEm = this.fontController.unitsPerEm;
    const fontSource = this.fontController.fontSourcesInstancer.instantiate(location);
    const ascender =
      fontSource?.lineMetricsHorizontalLayout["ascender"]?.value || 0.8 * unitsPerEm;
    const descender =
      fontSource?.lineMetricsHorizontalLayout["descender"]?.value || -0.2 * unitsPerEm;

    const svgPath = new SVGPath2D();
    glyphController.flattenedPath.drawToPath2d(svgPath);

    const size = this.size;
    const height = this.height;
    this.width = Math.max(
      height,
      ((1 + 2 * this.marginSide) * size * glyphController.xAdvance) / unitsPerEm
    );

    const svgElement = svg.svg(
      {
        viewBox: svg.viewBox(
          -this.marginSide * unitsPerEm,
          -(ascender + this.marginTop * unitsPerEm),
          glyphController.xAdvance + 2 * this.marginSide * unitsPerEm,
          ascender - descender + (this.marginTop + this.marginBottom) * unitsPerEm
        ),
        width: this.width,
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
        this._glyphSVG
          ? this._glyphSVG
          : html.div({ style: `width: ${this.width}px; height: ${this.height}px;` }, [
              "...",
            ]),
        html.div({ class: "glyph-name-label", style: `width: ${this.width}px;` }, [
          this.glyphName,
        ]),
        html.div({
          class: "glyph-status-color",
          style: `background-color: ${this._glyphStatusColor};`,
        }),
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

  let status = varGlyph?.sources[sourceIndex].customData["fontra.development.status"];
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
