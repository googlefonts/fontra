import { QueueIterator } from "../core/queue-iterator.js";
import { hyphenatedToCamelCase, round } from "../core/utils.js";
import { SimpleElement } from "../core/unlit.js";
import * as html from "../core/unlit.js";
import { themeColorCSS } from "./theme-support.js";
import { RangeSlider } from "/web-components/range-slider.js";

const colors = {
  "ui-form-input-foreground-color": ["black", "white"],
  "ui-form-input-background-color": ["white", "#333"],
  "ui-form-input-border-color": ["#888", "#222"],
  "slider-thumb-color": ["#444", "#bbb"],
};

export class Form extends SimpleElement {
  static styles = `
    ${themeColorCSS(colors)}

    .ui-form {
      display: grid;
      grid-template-columns: 30% auto;
      box-sizing: border-box;
      gap: 0.35rem 0.35rem;
      overflow-x: hidden;
      overflow-y: auto;
      margin: 0em;
      padding: 0em;
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

    input {
      box-sizing: border-box;
    }

    .ui-form-value {
      box-sizing: border-box;
    }

    .ui-form-value input {
      font-family: "fontra-ui-regular";
      border: solid 1px var(--ui-form-input-border-color);
      background-color: var(--ui-form-input-background-color);
      color: var(--ui-form-input-foreground-color);
      width: min(100%, 9.5em);
    }

    .ui-form-value input[type="number"] {
      width: 4em;
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
    const rangeElement = new RangeSlider();
    rangeElement.minValue = fieldItem.minValue;
    rangeElement.value = fieldItem.value;
    rangeElement.maxValue = fieldItem.maxValue;

    {
      // Slider change closure
      let valueStream = undefined;

      rangeElement.onChangeCallback = (event) => {
        const value = event.value;
        if (event.dragBegin) {
          valueStream = new QueueIterator(5, true);
          this._fieldChanging(fieldItem.key, value, valueStream);
        }

        if (valueStream) {
          valueStream.put(value);
          this._dispatchEvent("doChange", { key: fieldItem.key, value: value });
        } else {
          this._fieldChanging(fieldItem.key, value, undefined);
        }

        if (event.dragEnd) {
          valueStream.done();
          valueStream = undefined;
          this._dispatchEvent("endChange", { key: fieldItem.key });
        }
      };
    }

    valueElement.appendChild(rangeElement);
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
