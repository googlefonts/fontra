const modifierKeys = ["Shift", "Control", "Alt", "Meta"];


export class MouseTracker {

  constructor(options) {
    this._dragFunc = options.drag;
    this._hoverFunc = options.hover;
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
    // console.log("number of clicks:", event.detail);
    if (this._eventStream !== undefined) {
      throw new Error("unfinished event stream");
    }
    this._eventStream = new EventStream();
    this._dragFunc(this._eventStream, event);
  }

  handleMouseMove(event) {
    if (this._eventStream !== undefined) {
      // in mouse drag
      this._eventStream.pushEvent(event);
    } else {
      // hovering
      this._hoverFunc(event);
    }
  }

  handleMouseUp(event) {
    this._eventStream.pushEvent(event);
    this._eventStream.done();
    this._eventStream = undefined;
  }

  handleModifierKeyChange(event) {
    if (this._eventStream !== undefined && modifierKeys.indexOf(event.key) >= 0) {
      this._eventStream.pushEvent(event);
    }
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

  pushEvent(event) {
    if (this._resolve !== undefined) {
      this._resolve({"value": event, "done": false});
      this._reset();
    } else {
      // console.log("ignoring pushEvent: no iteration took place");
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
