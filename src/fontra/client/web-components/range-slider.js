import { themeColorCSS } from "./theme-support.js";
import { LitElement, css, html, unsafeCSS } from "../third-party/lit.js";

const colors = {
  "thumb-color": ["#333", "#bbb"],
  "track-color": ["#bbb", "#222"],
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
      border-radius: 5px;
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
      border-radius: 5px;
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
    name: { type: String, reflect: true },
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
        </div>
      </section>
    `;
  }

  handleMouseDown(event) {
    if (event.altKey) {
      event.preventDefault();
      this.reset(event);
    }
  }

  changeValue(event) {
    const value = event.target.value;
    const isValid = event.target.reportValidity() && isNumeric(value);
    if (isValid) {
      this.value = Number(value);
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
    this.onChangeCallback(this);
  }

  toggleFoldable(event) {
    const marker = this.shadowRoot.querySelector(".foldable-marker");
    marker?.classList.toggle("active");
    const foldable = this.shadowRoot.querySelector(".foldable");
    foldable.classList.toggle("active");
  }

  reset(event) {
    this.value = this.defaultValue;
    this.onChangeCallback(this);
  }

  buildTickmarks() {
    if (this.defaultValue > this.minValue && this.defaultValue <= this.maxValue) {
      this.tickmarksPositions.push(this.defaultValue);
    }
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
