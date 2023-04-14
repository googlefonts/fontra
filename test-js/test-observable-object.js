import chai from "chai";
const expect = chai.expect;

import { ObservableController } from "../src/fontra/client/core/observable-object.js";

describe("ObservableObject Tests", () => {
  it("change value test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (key, newValue, oldValue) => {
      result[key] = newValue;
    };
    controller.addListener(callback);
    controller.model.b = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("change value test new key", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (key, newValue, oldValue) => {
      expect(oldValue).to.equal(undefined);
      result[key] = newValue;
    };
    controller.addListener(callback);
    controller.model.c = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 2, c: 200 });
  });

  it("change value test with key listener", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (key, newValue, oldValue) => {
      expect(key).to.equal("b");
      result[key] = newValue;
    };
    controller.addKeyListener("b", callback);
    controller.model.a = 9999;
    controller.model.b = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("change value test setItem", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (key, newValue, oldValue) => {
      result[key] = newValue;
    };
    controller.addListener(callback);
    controller.setItem("b", 200);
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("delete item test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (key, newValue) => {
      expect(newValue).to.equal(undefined);
      delete result[key];
    };
    controller.addListener(callback);
    delete controller.model.b;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1 });
  });

  it("removeEventListener test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (key, newValue, oldValue) => {
      result[key] = newValue;
    };
    controller.addListener(callback);
    controller.model.a = 300;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
    controller.removeListener(callback);
    controller.model.b = 300;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
  });

  it("setItem skipListener test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (key, newValue, oldValue) => {
      result[key] = newValue;
    };
    controller.addListener(callback);
    controller.setItem("a", 300);
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
    controller.setItem("b", 300, callback); // skipListener
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
  });
});

function asyncTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
