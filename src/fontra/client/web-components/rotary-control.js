import * as html from "../core/html-utils.js";
import { round } from "../core/utils.js";
import { subVectors } from "../core/vector.js";

export class RotaryControl extends html.UnlitElement {
  static styles = `
  :host {
    --knob-size: 1.4rem;
    --thumb-size: calc(var(--knob-size) / 5);
  }

  .knob {
    width: var(--knob-size);
    height: var(--knob-size);
    border-radius: 50%;
    background: #e3e3e3;
    display: flex;
    justify-content: center;
  }

  .thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    background: rgb(89, 89, 89);
    border-radius: 50%;
    margin-top: calc(var(--knob-size) / 8);
  }

  .rotary-control {
    display: flex;
    gap: 0.4rem;
    margin: 0.2rem;
  }
  `;

  constructor() {
    super();
    this.onChangeCallback = () => {};

    document.body.addEventListener("mousemove", (event) => {
      if (this.startAngle === undefined) {
        return;
      }
      const origin = originOfElement(this.knob);
      const target = { x: event.clientX, y: event.clientY };
      const diff = angle(origin, target) - this.angleWhenDragStart;
      let value = this.startAngle + diff;
      this.value = round(value);
      this.dispatch(this.value);
    });

    document.body.addEventListener("mouseup", () => {
      this.startAngle = undefined;
      this.angleWhenDragStart = undefined;
    });
  }

  set value(value) {
    if (value < 0) {
      value = 360 + value;
    }
    value = value % 360;
    this._value = value;
    if (this.knob) {
      this.knob.style.transform = `rotate(${this.value}deg)`;
    }
  }

  get value() {
    return this._value;
  }

  dispatch(value) {
    if (value > 180) {
      value -= 360;
    }
    this.onChangeCallback(value);
  }

  render() {
    return html.div({ class: "rotary-control" }, [
      (this.knob = html.div(
        {
          onwheel: (event) => {
            const delta =
              Math.abs(event.deltaX) > Math.abs(event.deltaY)
                ? -1 * event.deltaX
                : event.deltaY;
            this.value = this.value + delta;
            this.dispatch(this.value);
          },
          class: "knob",
          style: `transform: rotate(${this.value}deg);`,
          onmousedown: (event) => {
            this.startAngle = this.value;
            const origin = originOfElement(this.knob);
            const target = { x: event.clientX, y: event.clientY };
            const deg = angle(origin, target);
            this.angleWhenDragStart = deg;
          },
        },
        [html.div({ class: "thumb" })]
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
  const vec = subVectors(target, origin);
  let deg = toDegrees(Math.atan2(vec.y, vec.x));

  deg += 90;

  if (deg < 0) {
    deg = 270 + (90 + deg);
  }
  return deg;
}

customElements.define("rotary-control", RotaryControl);
