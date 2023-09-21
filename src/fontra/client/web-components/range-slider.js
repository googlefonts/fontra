import { clamp, round } from "../core/utils.js";
import { LitElement, css, html, unsafeCSS } from "../third-party/lit.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "thumb-color": ["#333", "#ddd"],
  "thumb-color-at-default": ["#ccc", "#777"],
  "track-color": ["#ccc", "#222"],
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

    .range-container {
      position: relative;
      flex-grow: 1;
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

    .slider.is-at-default::-webkit-slider-thumb {
      background: var(--thumb-color-at-default);
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

    .slider.is-at-default::-moz-range-thumb {
      background: var(--thumb-color-at-default);
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

      outline: none;
      border: none;
      background-color: var(--text-input-background-color);
      color: var(--ui-element-foreground-color);

      padding: 3px;

      text-align: center;
      font-family: fontra-ui-regular;
      font-feature-settings: "tnum" 1;
      font-size: 0.9em;
    }
  `;

  static properties = {
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
    this.minValue = 0;
    this.maxValue = 100;
    this.defaultValue = this.minValue;
    this.value = this.defaultValue;
    this.tickmarksPositions = [];
    this.step = "any";
    this.sawMouseDown = false;
    this.sawMouseUp = false;
    this.onChangeCallback = () => {};
  }

  render() {
    delete this._rangeInputElement;
    const minMaxRange = this.maxValue - this.minValue;
    const decimalPlaces = minMaxRange < 100 ? 3 : 2;
    const value = round(this.value, decimalPlaces);
    const minValue = round(this.minValue, decimalPlaces);
    const defaultValue = round(this.defaultValue, decimalPlaces);
    const maxValue = round(this.maxValue, decimalPlaces);
    const isAtDefault = this.value == this.defaultValue;
    this.updateIsAtDefault();
    return html`
      <section class="wrapper">
        <div class="numeric-input">
          <section class="slider-input">
            <input
              type="number"
              @change=${this.changeValue}
              @keydown=${this.handleKeyDown}
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
            @change=${this.handleChange}
            @mousedown=${this.handleMouseDown}
            @keydown=${this.handleKeyDown}
            @mouseup=${this.handleMouseUp}
            class="slider ${isAtDefault ? "is-at-default" : ""}"
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

  handleKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    let increment = event.shiftKey ? 10 : 1;
    let newValue;
    switch (event.key) {
      case "ArrowDown":
        newValue = this.value - increment;
        break;
      case "ArrowUp":
        newValue = this.value + increment;
        break;
      default: {
        return;
      }
    }

    event.preventDefault();
    this.value = clamp(newValue, this.minValue, this.maxValue);
    this.updateIsAtDefault();
    this.onChangeCallback({ value: this.value });
  }

  handleMouseDown(event) {
    this.sawMouseDown = true;
    this.sawMouseUp = false;
    const activeElement = document.activeElement;
    this._savedCanvasElement =
      activeElement?.id === "edit-canvas" ? activeElement : undefined;
    if (event.altKey) {
      event.preventDefault();
      this.reset(event);
    }
  }

  handleMouseUp(event) {
    this._savedCanvasElement?.focus();
    this.sawMouseDown = false;
    this.sawMouseUp = true;
    this.onChangeCallback({ value: this.value, dragEnd: true });
  }

  handleChange(event) {
    if (!this.sawMouseUp) {
      this.onChangeCallback({ value: this.value, dragEnd: true });
    }
    this.sawMouseUp = false;
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
    this.updateIsAtDefault();

    const callbackEvent = { value: this.value };
    if (this.sawMouseDown) {
      callbackEvent.dragBegin = true;
    }
    this.sawMouseDown = false;
    this.onChangeCallback(callbackEvent);
  }

  updateIsAtDefault() {
    if (!this._rangeInputElement) {
      this._rangeInputElement = this.shadowRoot.querySelector(`input[type="range"]`);
    }
    this._rangeInputElement?.classList.toggle(
      "is-at-default",
      this.value == this.defaultValue
    );
  }

  toggleFoldable(event) {
    const marker = this.shadowRoot.querySelector(".foldable-marker");
    marker?.classList.toggle("active");
    const foldable = this.shadowRoot.querySelector(".foldable");
    foldable.classList.toggle("active");
  }

  reset(event) {
    this.value = this.defaultValue;
    this.onChangeCallback({ value: this.value });
  }

  buildTickmarks() {
    if (this.defaultValue > this.minValue && this.defaultValue <= this.maxValue) {
      this.tickmarksPositions.push(this.defaultValue);
    }
  }
}

customElements.define("range-slider", RangeSlider);

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
