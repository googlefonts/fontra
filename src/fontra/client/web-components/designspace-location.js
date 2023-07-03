import { UnlitElement } from "/core/unlit.js";
import * as html from "/core/unlit.js";
import { htmlToElement } from "/core/utils.js";
import { RangeSlider } from "./range-slider.js";

export class DesignspaceLocation extends UnlitElement {
  static styles = `
    :host {
      display: grid;
      grid-template-columns: 25% auto;
      gap: 0.4em;
      overflow: scroll;
    }

    .slider-label {
      text-align: right;
      overflow: hidden; /* this needs to be set so that width respects fit-content */
      text-overflow: ellipsis;
    }

    .slider-label:hover {
      /* overflow: visible; */  /* this is cool but makes the layout jump: too distracting? */
      cursor: pointer;
    }

    .info-box {
      display: none;
      grid-column: 1 / -1;
      margin-bottom: 0.5em;
      color: #999; /* lazy comprimise for light and dark modes */
    }

    .info-box.visible {
      display: initial;
    }

    .slider-divider {
      border: none;
      border-top: 1px solid gray;
      width: 90%;
      height: 1px;
      grid-column: 1 / -1;
    }
  `;

  static properties = {
    axes: { type: Array },
  };

  get model() {
    return this._controller.model;
  }

  get controller() {
    return this._controller;
  }

  set controller(controller) {
    if (this._controller) {
      this._controller.removeListener(this._modelListener);
    }
    this._controller = controller;
    this._modelListener = (key, newValue) => {
      const slider = this.shadowRoot.querySelector(`range-slider[name="${key}"]`);
      if (slider) {
        slider.value = newValue;
      }
    };
    this._controller.addListener(this._modelListener);
    this.values = controller.model;
  }

  get values() {
    if (!this._values) {
      this._values = {};
    }
    return this._values;
  }

  set values(values) {
    if (!this._values) {
      this._values = {};
    }
    for (const axis of this.axes || []) {
      const value = values[axis.name];
      if (value !== undefined) {
        const slider = this.shadowRoot.querySelector(
          `range-slider[name="${axis.name}"]`
        );
        if (slider) {
          slider.value = value;
        }
        this._values[axis.name] = value;
      }
    }
  }

  render() {
    if (!this.axes) {
      return;
    }
    const elements = [];
    for (const axis of this.axes) {
      if (axis.isDivider) {
        elements.push(html.hr({ class: "slider-divider" }));
        continue;
      }
      const modelValue = this.values[axis.name];
      const infoBox = htmlToElement(
        `<div class="info-box">
          <span>Min: <strong>${axis.minValue}</strong></span
          >&nbsp; | <span>Default: <strong>${axis.defaultValue}</strong></span
          >&nbsp; |
          <span>Max: <strong>${axis.maxValue}</strong></span>
        </div>`
      );
      elements.push(
        html.div(
          {
            class: "slider-label",
            onclick: (event) => this._toggleInfoBox(infoBox, event),
          },
          [axis.name]
        )
      );
      elements.push(
        html.createDomElement("range-slider", {
          name: axis.name,
          minValue: axis.minValue,
          maxValue: axis.maxValue,
          defaultValue: axis.defaultValue,
          value: modelValue !== undefined ? modelValue : axis.defaultValue,
          onChangeCallback: (event) => this._dispatchLocationChangedEvent(event),
        })
      );
      elements.push(infoBox);
    }
    return elements;
  }

  _toggleInfoBox(infoBox, event) {
    if (event.altKey) {
      const onOff = !infoBox.classList.contains("visible");
      for (const box of this.shadowRoot.querySelectorAll(".info-box")) {
        box.classList.toggle("visible", onOff);
      }
    } else {
      infoBox.classList.toggle("visible");
    }
  }

  _dispatchLocationChangedEvent(slider) {
    if (this.controller) {
      this.controller.setItem(slider.name, slider.value, this._modelListener);
    } else {
      this.values[slider.name] = slider.value;
      const event = new CustomEvent("locationChanged", {
        bubbles: false,
        detail: this,
      });
      this.dispatchEvent(event);
    }
  }
}

customElements.define("designspace-location", DesignspaceLocation);
