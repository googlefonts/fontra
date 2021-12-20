const modifierKeys = ["Shift", "Control", "Alt", "Meta"];


export class MouseTracker {

  constructor(options) {
    this.mouseDownFunc = options.mouseDown;
    this.hoverFunc = options.hover;
    this.localPointFunc = options.localPoint;
    this._eventStream = undefined;
    this._addEventListeners(options.element);
  }

  _addEventListeners(element) {
    element.addEventListener("mousedown", event => this.handleMouseDown(event))
    element.addEventListener("mousemove", event => this.handleMouseMove(event));
    element.addEventListener("mouseup", event => this.handleMouseUp(event));
    element.addEventListener("keydown", event => this.handleModifierKeyChange(event));
    element.addEventListener("keyup", event => this.handleModifierKeyChange(event));
  }

  handleMouseDown(event) {
    if (this._eventStream !== undefined) {
      throw new Error("unfinished event stream");
    }
    this._eventStream = new EventStream();
    this.mouseDownFunc(this._eventStream, this._packEvent(event));
  }

  handleMouseMove(event) {
    if (event.buttons) {
      // in mouse drag
      this._eventStream.pushValue(this._packEvent(event));
    } else {
      // hovering
      this.hoverFunc(this._packEvent(event));
    }
  }

  handleMouseUp(event) {
    this._eventStream.pushValue(this._packEvent(event));
    this._eventStream.done();
    this._eventStream = undefined;
  }

  handleModifierKeyChange(event) {
    if (this._eventStream !== undefined && modifierKeys.indexOf(event.key) >= 0) {
      this._eventStream.pushValue(this._packEvent(event));
    }
  }

  _packEvent(event) {
    if (event.x !== undefined) {
      this._point = this.localPointFunc(event);
    }
    return {"point": this._point, "event": event}
  }

}


class EventStream {

  constructor() {
    this._reset();
    this._done = false;
  }

  _reset() {
    this._resolve = undefined;
    this._reject = undefined;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next() {
    if (this._resolve !== undefined) {
      throw new Error("can't make a new Promise: the previous Promise is still pending");
    }
    if (this._done) {
      return Promise.resolve({"done": true});
    } else {
      return new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
      });
    }
  }

  pushValue(value) {
    if (this._resolve !== undefined) {
      this._resolve({"value": value, "done": false});
      this._reset();
    } else {
      console.log("ignoring pushValue: no iteration took place");
    }
  }

  pushError(error) {
    if (this._reject !== undefined) {
      this._reject(error);
      this._reset();
    } else {
      throw error;
    }
  }

  done() {
    this._done = true;
  }

}
