import * as html from "../core/html-utils.js";
import { subVectors } from "../core/vector.js";

export class RotaryControl extends html.UnlitElement {
  static styles = `
  .knob {
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    margin: 0.3rem;
    background: #e3e3e3;
    position: relative;
  }

  .thumb {
    width: 0.4rem;
    height: 90%;
    left: 50%;
    position: absolute;
    margin-left: -0.2rem;
    background: #ccc;
    top: 5%;
    border-radius: 10px;
  }

  .dot {
    width: 0.3rem;
    height: 0.3rem;
    border-radius: 50%;
    margin-top: 0.05rem;
    background: #d23737;
    margin-left: 0.05rem;
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
  }

  get value() {
    return this._value;
  }

  render() {
    return (this.knob = html.div(
      {
        class: "knob",
        onmousedown: (event) => {
          this.startAngle = this.value;
          const origin = originOfElement(this.knob);
          const target = { x: event.clientX, y: event.clientY };
          const sub = subVectors(target, origin);
          const deg = toDegrees(Math.atan2(sub.y, sub.x));
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
          const sub = subVectors(target, origin);
          const deg = toDegrees(Math.atan2(sub.y, sub.x));
          const diff = deg - this.angleWhenDragStart;
          this.value = this.startAngle + diff;
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
    ));
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

customElements.define("rotary-control", RotaryControl);
