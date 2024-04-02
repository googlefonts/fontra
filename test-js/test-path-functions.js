import { expect } from "chai";

import { rotatePoint } from "../src/fontra/client/core/path-functions.js";

describe("Path Functions Tests", () => {
  it("Rotate Point", () => {
    const point = { x: 100, y: 0 };
    const pinPoint = { x: 0, y: 0 };
    const angle = 90;
    const p = rotatePoint(pinPoint, point, angle);

    expect(p).to.deep.equal({ x: 0, y: 100 });
  });
});
