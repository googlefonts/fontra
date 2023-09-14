import { QueueIterator } from "../core/queue-iterator.js";
import { hyphenatedToCamelCase, round } from "../core/utils.js";
import { SimpleElement } from "../core/unlit.js";
import * as html from "../core/unlit.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "ui-form-input-foreground-color": ["black", "white"],
  "ui-form-input-background-color": ["white", "#333"],
  "ui-form-input-border-color": ["#888", "#222"],
  "slider-thumb-color": ["#444", "#bbb"],
};

export class Form extends SimpleElement {
  static styles = `
    ${themeColorCSS(colors)}

    input[type="range"] {
      --slider-track-width: 10em;
      --slider-track-height: 0.3em;
      --slider-track-color: #0008;
      --slider-track-border-radius: 0px;
      --slider-thumb-width: 15px;
      --slider-thumb-height: 10px;
      --slider-thumb-border-radius: 8px;
    }

    input[type="range"] {
      height: var(--slider-track-height);
      -webkit-appearance: none;
      margin: 5px 10px;
      width: var(--slider-track-width);
    }
    input[type="range"]:focus {
      outline: none;
    }

    input[type="range"]::-webkit-slider-runnable-track {
      width: var(--slider-track-width);
      height: var(--slider-track-height);
      cursor: pointer;
      animate: 0.2s;
      box-shadow: 0px 0px 0px #000000;
      background: var(--slider-track-color);
      border-radius: var(--slider-track-border-radius);
      border: 0px solid #000000;
    }
    input[type="range"]::-webkit-slider-thumb {
      box-shadow: 0px 0px 0px #000000;
      border: 0px solid #000000;
      height: var(--slider-thumb-height);
      width: var(--slider-thumb-width);
      border-radius: var(--slider-thumb-border-radius);
      background: var(--slider-thumb-color);
      cursor: pointer;
      -webkit-appearance: none;
      margin-top: -3px;
    }
    input[type="range"]:focus::-webkit-slider-runnable-track {
      background: var(--slider-track-color);
    }
    input[type="range"]::-moz-range-track {
      /* width: var(--slider-track-width); */
      height: var(--slider-track-height);
      cursor: pointer;
      animate: 0.2s;
      box-shadow: 0px 0px 0px #000000;
      background: var(--slider-track-color);
      border-radius: var(--slider-track-border-radius);
      border: 0px solid #000000;
    }
    input[type="range"]::-moz-range-thumb {
      box-shadow: 0px 0px 0px #000000;
      border: 0px solid #000000;
      height: var(--slider-thumb-height);
      width: var(--slider-thumb-width);
      border-radius: var(--slider-thumb-border-radius);
      background: var(--slider-thumb-color);
      cursor: pointer;
    }
    input[type="range"]::-ms-track {
      width: var(--slider-track-width);
      height: var(--slider-track-height);
      cursor: pointer;
      animate: 0.2s;
      background: transparent;
      border-color: transparent;
      color: transparent;
    }
    input[type="range"]::-ms-fill-lower {
      background: var(--slider-track-color);
      border: 0px solid #000000;
      border-radius: var(--slider-thumb-border-radius);
      box-shadow: 0px 0px 0px #000000;
    }
    input[type="range"]::-ms-fill-upper {
      background: var(--slider-track-color);
      border: 0px solid #000000;
      border-radius: var(--slider-thumb-border-radius);
      box-shadow: 0px 0px 0px #000000;
    }
    input[type="range"]::-ms-thumb {
      margin-top: 1px;
      box-shadow: 0px 0px 0px #000000;
      border: 0px solid #000000;
      height: var(--slider-thumb-height);
      width: var(--slider-thumb-width);
      border-radius: var(--slider-thumb-border-radius);
      background: var(--slider-thumb-color);
      cursor: pointer;
    }

    input[type="range"]:focus::-ms-fill-lower {
      background: var(--slider-track-color);
    }

    input[type="range"]:focus::-ms-fill-upper {
      background: var(--slider-track-color);
    }

    .ui-form {
      display: grid;
      grid-template-columns: 32% 68%;
      gap: 0.35rem 0.35rem;
      overflow-x: hidden;
      overflow-y: auto;
    }

    .ui-form-label {
      text-align: right;
      align-self: center;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    hr {
      border: none;
      border-top: 1px solid var(--horizontal-rule-color);
      width: 100%;
      height: 1px;
      margin-block-start: 0.2em;
      margin-block-end: 0.1em;
      grid-column: 1 / span 2;
    }

    .ui-form-label.header {
      font-weight: bold;
      grid-column: 1 / span 2;
      text-align: left;
    }

    .ui-form-value input {
      font-family: "fontra-ui-regular";
      border: solid 1px var(--ui-form-input-border-color);
      background-color: var(--ui-form-input-background-color);
      color: var(--ui-form-input-foreground-color);
      width: 9.5em;
    }

    .ui-form-value input[type="number"] {
      width: 4em;
    }

    .ui-form-value input[type="range"] {
      width: 7em;
    }

    .ui-form-value.text {
      white-space: normal;
    }
  `;

  constructor() {
    super();
    this.contentElement = this.shadowRoot.appendChild(document.createElement("div"));
    this.contentElement.classList.add("ui-form");
  }

  setFieldDescriptions(fieldDescriptions) {
    this.contentElement.innerHTML = "";
    this._fieldGetters = {};
    this._fieldSetters = {};
    if (!fieldDescriptions) {
      return;
    }
    for (const fieldItem of fieldDescriptions) {
      if (fieldItem.type === "divider") {
        this.contentElement.appendChild(html.hr());
        continue;
      }
      const labelElement = document.createElement("div");
      labelElement.classList.add("ui-form-label", fieldItem.type);
      const valueElement = document.createElement("div");
      valueElement.classList.add("ui-form-value", fieldItem.type);

      let label = fieldItem.label || fieldItem.key || "";
      if (label.length && fieldItem.type !== "header") {
        label += ":";
      }
      labelElement.innerHTML = label;
      this.contentElement.appendChild(labelElement);
      if (fieldItem.type === "header") {
        continue;
      }
      this.contentElement.appendChild(valueElement);

      const methodName = hyphenatedToCamelCase("_add-" + fieldItem.type);
      if (this[methodName] === undefined) {
        throw new Error(`Unknown field type: ${fieldItem.type}`);
      }
      this[methodName](valueElement, fieldItem);
    }
  }

  _addHeader(valueElement, fieldItem) {
    this._addText(valueElement, fieldItem);
  }

  _addNumber(valueElement, fieldItem) {
    this._addText(valueElement, fieldItem);
  }

  _addText(valueElement, fieldItem) {
    if (fieldItem.value !== undefined) {
      valueElement.innerText = fieldItem.value;
      this._fieldGetters[fieldItem.key] = () => valueElement.innerText;
      this._fieldSetters[fieldItem.key] = (value) => (valueElement.innerText = value);
    }
  }

  _addEditText(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.value = fieldItem.value || "";
    inputElement.disabled = fieldItem.disabled;
    inputElement.onchange = (event) => {
      this._fieldChanging(fieldItem.key, inputElement.value, undefined);
    };
    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = (value) => (inputElement.value = value);
    valueElement.appendChild(inputElement);
  }

  _addEditNumber(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    inputElement.type = "number";
    inputElement.value = fieldItem.value;
    inputElement.step = "any";
    inputElement.disabled = fieldItem.disabled;
    inputElement.onchange = (event) => {
      this._fieldChanging(fieldItem.key, parseFloat(inputElement.value), undefined);
    };
    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = (value) => (inputElement.value = value);
    valueElement.appendChild(inputElement);
  }

  _addEditNumberSlider(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    const sliderElement = document.createElement("input");
    inputElement.type = "number";
    sliderElement.type = "range";
    for (const el of [inputElement, sliderElement]) {
      el.step = "any";
      el.min = fieldItem.minValue;
      el.max = fieldItem.maxValue;
      el.value = fieldItem.value;
      el.disabled = fieldItem.disabled;
    }

    {
      // Slider change closure
      let valueStream = undefined;
      let savedCanvasElement;
      sliderElement.oninput = (event) => {
        // Continuous changes
        inputElement.value = round(sliderElement.value, 3);
        const value = parseFloat(inputElement.value);
        if (!valueStream) {
          valueStream = new QueueIterator(5, true);
          this._fieldChanging(fieldItem.key, value, valueStream);
        }
        valueStream.put(value);
        this._dispatchEvent("doChange", { key: fieldItem.key, value: value });
      };
      sliderElement.onchange = (event) => {
        // Single change, or final change after continuous changes
        if (valueStream) {
          valueStream.done();
          valueStream = undefined;
          this._dispatchEvent("endChange", { key: fieldItem.key });
        }
      };
      sliderElement.onmousedown = (event) => {
        const activeElement = document.activeElement;
        savedCanvasElement =
          activeElement?.id === "edit-canvas" ? activeElement : undefined;
      };
      sliderElement.onmouseup = (event) => {
        // sliderElement.onchange is ONLY triggered when the final slider value
        // is different from the initial value. However, we may have been in
        // a live drag, and we need to handle the end of the slider drag no
        // matter what the final value. To work around this, we also listen to
        // "mouseup".
        sliderElement.onchange(event);
        savedCanvasElement?.focus();
      };
    }

    inputElement.onchange = (event) => {
      sliderElement.value = inputElement.value;
      inputElement.value = sliderElement.value; // Use slider's clamping
      this._fieldChanging(fieldItem.key, parseFloat(inputElement.value), undefined);
    };
    this._fieldGetters[fieldItem.key] = () => sliderElement.value;
    this._fieldSetters[fieldItem.key] = (value) => {
      inputElement.value = value;
      sliderElement.value = value;
    };
    valueElement.appendChild(inputElement);
    valueElement.appendChild(sliderElement);
  }

  addEventListener(eventName, handler, options) {
    this.contentElement.addEventListener(eventName, handler, options);
  }

  _fieldChanging(fieldKey, value, valueStream) {
    if (valueStream) {
      this._dispatchEvent("beginChange", { key: fieldKey });
    } else {
      this._dispatchEvent("doChange", { key: fieldKey, value: value });
    }
    const handlerName = "onFieldChange";
    if (this[handlerName] !== undefined) {
      this[handlerName](fieldKey, value, valueStream);
    }
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: detail,
    });
    this.contentElement.dispatchEvent(event);
  }

  getKeys() {
    return Object.keys(this._fieldGetters);
  }

  getValue(key) {
    const getter = this._fieldGetters[key];
    if (getter === undefined) {
      throw new Error(`getting unknown Form key: ${key}`);
    }
    return getter();
  }

  setValue(key, value) {
    const setter = this._fieldSetters[key];
    if (setter === undefined) {
      throw new Error(`setting unknown Form key: ${key}`);
    }
    setter(value);
  }
}

customElements.define("ui-form", Form);
