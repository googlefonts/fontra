import { RangeSlider } from "./range-slider.js";
import * as html from "/core/html-utils.js";
import { UnlitElement, htmlToElement } from "/core/html-utils.js";

export class DesignspaceLocation extends UnlitElement {
  static styles = `
    :host {
      display: grid;
      grid-template-columns: 25% auto;
      gap: 0.4em;
      overflow: auto;
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

    hr {
      border: none;
      border-top: 1px dotted var(--horizontal-rule-color);
      width: 100%;
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
    this._modelListener = (event) => {
      if (event.senderInfo === this) {
        // Event was triggered by us -- ignore
        return;
      }
      const slider = this._sliders?.[event.key];
      if (slider) {
        slider.value = event.newValue;
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
    this._values = { ...values };

    for (const [axisName, value] of Object.entries(values)) {
      const slider = this._sliders?.[axisName];
      if (slider) {
        slider.value = value;
      }
    }

    for (const axis of this.axes || []) {
      if (!(axis.name in values)) {
        const slider = this._sliders?.[axis.name];
        if (slider) {
          slider.value = axis.defaultValue;
        }
      }
    }
  }

  render() {
    if (!this.axes) {
      return;
    }
    this._sliders = {};
    const elements = [];
    for (const axis of this.axes) {
      if (axis.isDivider) {
        elements.push(html.hr());
        continue;
      }
      const modelValue = this.values[axis.name];
      const infoBox = htmlToElement(
        `<div class="info-box">
          ${
            axis.values && axis.values.length > 0
              ? `
          <span>Default: <strong>${axis.defaultValue}</strong></span>&nbsp; |
          <span>Values: <strong style="white-space: break-spaces;">${axis.values.join(
            ", "
          )}</strong></span>
          `
              : `
          <span>Min: <strong>${axis.minValue}</strong></span>&nbsp; |
          <span>Default: <strong>${axis.defaultValue}</strong></span>&nbsp; |
          <span>Max: <strong>${axis.maxValue}</strong></span>
          `
          }
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
      const slider = html.createDomElement("range-slider", {
        minValue: axis.minValue,
        maxValue: axis.maxValue,
        values: axis.values,
        defaultValue: axis.defaultValue,
        value: modelValue !== undefined ? modelValue : axis.defaultValue,
        onChangeCallback: (event) =>
          this._dispatchLocationChangedEvent(axis.name, event.value),
      });
      this._sliders[axis.name] = slider;
      elements.push(slider);
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

  _dispatchLocationChangedEvent(name, value) {
    if (this.controller) {
      this.controller.setItem(name, value, this);
    } else {
      this.values[name] = value;
      const event = new CustomEvent("locationChanged", {
        bubbles: false,
        detail: this,
      });
      this.dispatchEvent(event);
    }
  }
}

customElements.define("designspace-location", DesignspaceLocation);
