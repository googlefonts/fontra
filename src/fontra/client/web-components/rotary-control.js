import * as html from "../core/html-utils.js";
import { subVectors } from "../core/vector.js";

export class RotaryControl extends html.UnlitElement {
  static styles = `
  :host {
    --knob-size: 2rem;
    --thumb-width: 0.2rem;
  }

  .knob {
    width: var(--knob-size);
    height: var(--knob-size);
    border-radius: 50%;
    background: #e3e3e3;
    position: relative;
  }

  .thumb {
    width: var(--thumb-width);
    height: var(--knob-size);
    left: 50%;
    position: absolute;
    margin-left: calc((var(--thumb-width) / 2) * -1);
    background: #ccc;
    border-radius: 10px;
  }

  .dot {
    width: var(--thumb-width);
    height: var(--thumb-width);
    border-radius: 50%;
    background: #d23737;
  }

  .rotary-control {
    display: flex;
    gap: 0.4rem;
    margin: 0.2rem;
  }

  .number-input {
    width: 4rem;
  }
  `;

  constructor() {
    super();
    this.onChangeCallback = () => {};
  }

  set value(value) {
    this._value = value;
    if (this.thumb) {
      this.thumb.style.transform = `rotate(${this.value}deg)`;
    }
    if (this.numberInput) {
      this.numberInput.value = this.value;
    }
  }

  get value() {
    return this._value;
  }

  render() {
    return html.div({ class: "rotary-control" }, [
      (this.numberInput = html.input({
        class: "number-input",
        type: "number",
        step: "any",
        required: "required",
        min: 0,
        max: 360,
        value: this.value,
        onchange: (event) => {
          if (event.target.reportValidity()) {
            this.value = event.target.valueAsNumber;
          }
        },
      })),
      (this.knob = html.div(
        {
          class: "knob",
          onmousedown: (event) => {
            this.startAngle = this.value;
            const origin = originOfElement(this.knob);
            const target = { x: event.clientX, y: event.clientY };
            const deg = angle(origin, target);
            this.angleWhenDragStart = deg;
          },
          onmouseup: (event) => {
            this.startAngle = undefined;
            this.angleWhenDragStart = undefined;
          },
          onmousemove: (event) => {
            if (this.startAngle === undefined) {
              return;
            }
            const origin = originOfElement(this.knob);
            const target = { x: event.clientX, y: event.clientY };
            const diff = angle(origin, target) - this.angleWhenDragStart;
            let value = this.startAngle + diff;
            if (value < 0) {
              value = 270 + (90 + value);
            }
            this.value = value;
            this.onChangeCallback(this.value);
          },
        },
        [
          (this.thumb = html.div(
            {
              class: "thumb",
              style: `transform: rotate(${this.value}deg);`,
            },
            [
              html.div({
                class: "dot",
              }),
            ]
          )),
        ]
      )),
    ]);
  }
}

function originOfElement(element) {
  const boundingClientRect = element.getBoundingClientRect();
  return {
    x: boundingClientRect.x + boundingClientRect.width / 2,
    y: boundingClientRect.y + boundingClientRect.height / 2,
  };
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function angle(origin, target) {
  const sub = subVectors(target, origin);
  const deg = toDegrees(Math.atan2(sub.y, sub.x));
  return deg;
}

customElements.define("rotary-control", RotaryControl);
