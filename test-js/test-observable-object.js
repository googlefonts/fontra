import chai from "chai";
const expect = chai.expect;

import { newObservableObject } from "../src/fontra/client/core/observable-object.js";

describe("ObservableObject Tests", () => {
  it("change value test", async () => {
    const obj = new newObservableObject({ a: 1, b: 2 });
    expect(obj).to.deep.equal({ a: 1, b: 2 });
    let result;
    const callback = (event) => {
      result = { ...event.target };
    };
    obj.addEventListener("changed", callback);
    obj.b = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("delete item test", async () => {
    const obj = new newObservableObject({ a: 1, b: 2 });
    let result;
    const callback = (event) => {
      result = { ...event.target };
    };
    obj.addEventListener("deleted", callback);
    delete obj.b;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1 });
  });

  it("removeEventListener test", async () => {
    const obj = new newObservableObject({ a: 1, b: 2 });
    let result;
    const callback = (event) => {
      result = { ...event.target };
    };
    obj.addEventListener("changed", callback);
    obj.a = 300;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
    obj.removeEventListener("changed", callback);
    obj.b = 300;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
  });

  it("unknown event type throw test", async () => {
    const obj = new newObservableObject();
    expect(() => obj.addEventListener("unknown")).to.throw(
      "event type must be one of changed,deleted, got unknown instead"
    );
  });
});

function asyncTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
