import { themeColorCSS } from "./theme-support.js";
import { LitElement, css, html, unsafeCSS } from "../third-party/lit.js";

const colors = {
  "thumb-color": ["#333", "#bbb"],
  "track-color": ["#bbb", "#222"],
  "foldable-marker-color": ["#bbb", "#888"],
};

export class RangeSlider extends LitElement {
  static styles = css`
    ${unsafeCSS(themeColorCSS(colors))}

    :host {
      --thumb-height: 14px;
      --thumb-width: 14px;
      --track-height: 5px;
    }

    .wrapper {
      position: relative;
      display: flex;
      gap: 0.5em;
      font-family: fontra-ui-regular, sans-serif;
      font-feature-settings: "tnum" 1;
    }

    .slider-name {
      min-width: 7ch;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
    }

    .slider-name:hover {
      cursor: pointer;
    }

    .foldable-marker {
      position: relative;
      color: var(--foldable-marker-color);
      top: 2px;
      display: inline-block;
    }

    .foldable-marker.active {
      transform: rotate(90deg);
    }

    .foldable {
      display: none;
      margin: 0.2em 0 0.4em 0;
      font-size: 1em;
      color: #999; /* lazy comprimise for light and dark modes */
    }

    .foldable > p {
      margin: 0;
    }

    .foldable.active {
      display: block;
    }

    .range-container {
      position: relative;
    }

    /* Chrome, Safari, Edge, Opera */
    .slider-numeric-input::-webkit-outer-spin-button,
    .slider-numeric-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* Firefox */
    .slider-numeric-input[type="number"] {
      -moz-appearance: textfield;
    }

    .slider {
      -webkit-appearance: none;
      position: relative;
      margin: 0;
      width: 100%;
      background: transparent;
    }

    /* Special styling for WebKit/Blink */
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      height: var(--thumb-height);
      width: var(--thumb-width);
      background: var(--thumb-color);
      border: none;
      border-radius: 7px;
      cursor: pointer;
      margin-top: -4.5px; /* You need to specify a margin in Chrome, but in Firefox and IE it is automatic */
    }

    .slider::-webkit-slider-runnable-track {
      height: var(--track-height);
      background: var(--track-color);
    }

    /* Firefox */
    .slider::-moz-range-thumb {
      height: var(--thumb-height);
      width: var(--thumb-width);
      background: var(--thumb-color);
      border: none;
      cursor: pointer;
    }

    .slider::-moz-range-track {
      height: var(--track-height);
      background: var(--track-color);
    }

    .range-container > input + div {
      margin-top: -11px;
      z-index: -1;
    }

    .range-container > .range-slider-options {
      position: relative;
      padding: 0 10px; // half of var(--thumb-width). Not recognised if referenced by variable
    }

    .range-container > .range-slider-options > span {
      display: block;
      position: relative;
      left: calc(var(--offset));
      width: 2px;
      height: 5.5px;
      opacity: 0.65;
      background: dimgray;
    }

    input {
      width: inherit;
    }

    .numeric-input > div {
      opacity: 0.3;
      font-size: 1em;
      padding: 5px;
      pointer-events: none;
    }

    .numeric-input > .slider-input {
      position: relative;
    }

    .numeric-input > .slider-input > .slider-numeric-input {
      width: 40px;
      border-radius: 6px;

      border: none;
      background-color: var(--editor-text-entry-input-background-color);
      color: var(--ui-form-input-foreground-color);

      padding: 3px;

      text-align: center;
      font-family: fontra-ui-regular;
      font-feature-settings: "tnum" 1;
      font-size: 0.9em;
    }
  `;

  static properties = {
    name: { type: String },
    minValue: { type: Number },
    maxValue: { type: Number },
    defaultValue: { type: Number },
    value: { type: Number },
    tickmarksPositions: { type: Array },
    step: { type: Number },
    onChangeCallback: { type: Function },
  };

  constructor() {
    super();
    // Fallbacks for attributes that are not defined when calling the component
    this.name = "Slider";
    this.minValue = 0;
    this.maxValue = 100;
    this.defaultValue = this.minValue;
    this.value = this.defaultValue;
    this.tickmarksPositions = [];
    this.step = "any";
    this.onChangeCallback = () => {};
  }

  render() {
    const minMaxRange = this.maxValue - this.minValue;
    const decimalPlaces = minMaxRange < 100 ? 3 : 2;
    const value = roundToDecimal(this.value, decimalPlaces);
    const minValue = roundToDecimal(this.minValue, decimalPlaces);
    const defaultValue = roundToDecimal(this.defaultValue, decimalPlaces);
    const maxValue = roundToDecimal(this.maxValue, decimalPlaces);
    return html`
      <section class="wrapper">
        <div class="slider-name" @click=${this.toggleFoldable}>
          <!--<span class="foldable-marker">▶</span>-->
          ${this.name}
        </div>
        <div class="numeric-input">
          <section class="slider-input">
            <input
              type="number"
              @change=${this.changeValue}
              class="slider-numeric-input"
              min=${this.minValue}
              max=${this.maxValue}
              step=${this.step}
              pattern="[0-9]+"
              .value=${value}
            />
          </section>
        </div>
        <div class="range-container">
          <input
            type="range"
            @input=${this.changeValue}
            @mousedown=${this.handleMouseDown}
            class="slider"
            min=${this.minValue}
            max=${this.maxValue}
            step=${this.step}
            .value=${this.value}
            list="markers"
          />
          <div class="range-slider-options">
            ${this.tickmarksPositions.map((pos) => {
              const posOffset =
                ((pos - this.minValue) / (this.maxValue - this.minValue)) * 100;
              return html`<span style="--offset: ${posOffset}%;"></span>`;
            })}
          </div>
          <datalist id="markers">
            ${this.tickmarksPositions.map(
              (pos) => html`<option value="${pos}"></option>`
            )}
          </datalist>
        </div>
      </section>
      <div class="foldable">
        <!-- <p><strong>${this.name}</strong></p> -->
        <p>
          <span>Min: <strong>${minValue}</strong></span
          >&nbsp; | <span>Default: <strong>${defaultValue}</strong></span
          >&nbsp; |
          <span>Max: <strong>${maxValue}</strong></span>
        </p>
      </div>
    `;
  }

  handleMouseDown(event) {
    if (event.altKey) {
      event.preventDefault();
      this.reset();
    }
  }

  changeValue(event) {
    const value = event.target.value;
    const isValid = event.target.reportValidity() && isNumeric(value);
    if (isValid) {
      this.value = value;
    } else {
      event.target.setAttribute("aria-invalid", !isValid);
      if (!isNumeric(value)) {
        this.value = this.defaultValue;
      } else if (value < this.minValue) {
        this.value = this.minValue;
      } else if (value > this.maxValue) {
        this.value = this.maxValue;
      } else {
        this.value = this.defaultValue;
      }
    }
    this.onChangeCallback();
  }

  toggleFoldable(event) {
    const marker = this.shadowRoot.querySelector(".foldable-marker");
    marker?.classList.toggle("active");
    const foldable = this.shadowRoot.querySelector(".foldable");
    foldable.classList.toggle("active");
  }

  reset() {
    this.value = this.defaultValue;
    this.onChangeCallback(this.value);
  }

  buildTickmarks() {
    if (this.defaultValue > this.minValue && this.defaultValue <= this.maxValue) {
      this.tickmarksPositions.push(this.defaultValue);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    // this.buildTickmarks();  // The tickmarks aren't displayed correctly, so skip for now.
    this.reset();
  }
}

customElements.define("range-slider", RangeSlider);

function roundToDecimal(value, decimalPlaces = 2) {
  return Number(
    Math.round(parseFloat(value + "e" + decimalPlaces)) + "e-" + decimalPlaces
  );
}

function isNumeric(str) {
  if (typeof str != "string") {
    // we only process strings
    return false;
  }
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}
