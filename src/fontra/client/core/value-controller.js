import { QueueIterator } from "./queue-iterator.js";


export class ValueController {

  constructor(initialValue) {
    this._observers = new Map();
    this._value = initialValue;
  }

  set(value, senderID) {
    if (senderID && !this._observers.has(senderID)) {
      throw new Error("can't set value: unknown observer senderID");
    }
    this._value = value;
    this._observers.forEach((valueStream, valueSenderID, map) => {
      if (valueSenderID !== senderID) {
        valueStream.put(value);
      }
    });

  }

  observe(senderID) {
    if (!senderID) {
      throw new Error("missing/falsey senderID argument");
    }
    const valueStream = new QueueIterator();
    valueStream.put(this._value);
    this._observers.set(senderID, valueStream);
    return valueStream;
  }

  unobserve(senderID) {
    this._observers.delete(senderID);
  }

}
