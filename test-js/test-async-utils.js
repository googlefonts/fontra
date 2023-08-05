import chai from "chai";
import { memoize } from "../src/fontra/client/core/async-utils.js";

const expect = chai.expect;

describe("memoize", () => {
  it("should memoize the result of given async function", async () => {
    let nTimesWorked = 0;
    const func = memoize(async (n) => {
      nTimesWorked += 1;
      return n * n;
    });
    expect(await func(2)).equal(4);
    expect(await func(2)).equal(4);
    expect(nTimesWorked).equal(1);
  });
  it("should give the awaiting promise when a function called before the previous execution is done", async () => {
    let nTimesWorked = 0;
    const func = memoize(async (n) => {
      nTimesWorked += 1;
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      return n * n;
    });
    const pending = func(2);
    expect(nTimesWorked).equal(1);
    await func(2);
    await pending;
    expect(nTimesWorked).equal(1);
    const result = await func(4);
    expect(nTimesWorked).equal(2);
    expect(result).equal(16);
  });
});
