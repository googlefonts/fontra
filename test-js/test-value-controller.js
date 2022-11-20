import chai from "chai";
const expect = chai.expect;


import { ValueController } from "../src/fontra/client/core/value-controller.js";


describe("ValueController Tests", () => {

  it("basic tests", async () => {
    const vc = new ValueController(1);
    const obs1 = vc.observe("obs1");
    const obs2 = vc.observe("obs2");
    const obs3 = vc.observe("obs3", true);
    vc.set(100, "obs1");
    vc.set(200, "obs2");
    vc.set(300);
    const result1 = [];
    const result2 = [];
    const result3 = [];
    collectResult(obs1, result1);
    collectResult(obs2, result2);
    collectResult(obs3, result3);
    await asyncTimeout(0);  // Give the event loop time to handle the events
    expect(result1).to.deep.equal([1, 200, 300]);
    expect(result2).to.deep.equal([1, 100, 300]);
    expect(result3).to.deep.equal([1, 100, 200, 300]);

    vc.unobserve("obs1");
    vc.set(20, "obs2");
    vc.set(30);
    await asyncTimeout(0);  // Give the event loop time to handle the events

    expect(result1).to.deep.equal([1, 200, 300]);
    expect(result2).to.deep.equal([1, 100, 300, 30]);
    expect(result3).to.deep.equal([1, 100, 200, 300, 20, 30]);

    expect(() => vc.set(10, "obs1")).to.throw("can't set value: unknown observer senderID");
  });

  it("double observe throw test", async () => {
    const vc = new ValueController(1);
    const obs1 = vc.observe("obs1");
    expect(() => vc.observe("obs1")).to.throw("already observing with senderID obs1");
  });

});


async function collectResult(observer, result) {
  for await (const v of observer) {
    result.push(v);
  }
};


function asyncTimeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
