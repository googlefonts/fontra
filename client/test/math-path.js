import chai from "chai";
const assert = chai.assert,
      expect = chai.expect;

import MathPath from "../src/math-path.js";
import MathArray from "../src/math-array.js";


class MockPath2D {
  constructor() {
    this.items = [];
  }
  moveTo(x, y) {
    this.items.push({op: "moveTo", args: [x, y]})
  }
  lineTo(x, y) {
    this.items.push({op: "lineTo", args: [x, y]})
  }
  bezierCurveTo(x1, y1, x2, y2, x3, y3) {
    this.items.push({op: "bezierCurveTo", args: [x1, y1, x2, y2, x3, y3]})
  }
  bezierQuadTo(x1, y1, x2, y2) {
    this.items.push({op: "bezierQuadTo", args: [x1, y1, x2, y2]})
  }
  closePath() {
    this.items.push({op: "closePath", args: []});
  }
}


describe("Path Tests", () => {
  
  it("copy empty", () => {
    const p = new MathPath();
    const p2 = p.copy();
    const mp = new MockPath2D();
    expect(p2.coordinates).to.deep.equal([]);
    expect(p2.pointTypes).to.deep.equal([]);
    expect(p2.contours).to.deep.equal([]);
    p2.drawToPath(mp);
    expect(mp.items).to.deep.equal([]);
  })

  it("test construct", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    expect(p.coordinates).to.deep.equal([0, 0, 0, 100, 100, 100, 100, 0]);
    expect(p.pointTypes).to.deep.equal([MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE]);
    expect(p.contours).to.deep.equal([{endPoint: 3, isClosed: true}]);
  })

  it("test copy", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const p2 = p.copy();
    // modify original
    p.coordinates[0] = 1000;
    p.pointTypes[0] = MathPath.OFF_CURVE_QUAD
    p.contours[0].isClosed = false;
    expect(p2.coordinates).to.deep.equal([0, 0, 0, 100, 100, 100, 100, 0]);
    expect(p2.pointTypes).to.deep.equal([MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE]);
    expect(p2.contours).to.deep.equal([{endPoint: 3, isClosed: true}]);
  })

  it("test draw", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE, MathPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const mp = new MockPath2D();
    p.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 100], "op": "lineTo"},
        {"args": [100, 100], "op": "lineTo"},
        {"args": [100, 0], "op": "lineTo"},
        {"args": [0, 0], "op": "lineTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("test quad", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.ON_CURVE, MathPath.OFF_CURVE_QUAD, MathPath.OFF_CURVE_QUAD, MathPath.OFF_CURVE_QUAD],
      [{endPoint: 3, isClosed: true}],
    );
    const mp = new MockPath2D();
    p.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 100, 50, 100], "op": "bezierQuadTo"},
        {"args": [100, 100, 100, 50], "op": "bezierQuadTo"},
        {"args": [100, 0, 0, 0], "op": "bezierQuadTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("test quad blob", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.OFF_CURVE_QUAD, MathPath.OFF_CURVE_QUAD, MathPath.OFF_CURVE_QUAD, MathPath.OFF_CURVE_QUAD],
      [{endPoint: 3, isClosed: true}],
    );
    const mp = new MockPath2D();
    p.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [50, 0], "op": "moveTo"},
        {"args": [0, 0, 0, 50], "op": "bezierQuadTo"},
        {"args": [0, 100, 50, 100], "op": "bezierQuadTo"},
        {"args": [100, 100, 100, 50], "op": "bezierQuadTo"},
        {"args": [100, 0, 50, 0], "op": "bezierQuadTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("test cubic", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.ON_CURVE, MathPath.OFF_CURVE_CUBIC, MathPath.OFF_CURVE_CUBIC, MathPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const mp = new MockPath2D();
    p.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 100, 100, 100, 100, 0], "op": "bezierCurveTo"},
        {"args": [0, 0], "op": "lineTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("test add", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.ON_CURVE, MathPath.OFF_CURVE_CUBIC, MathPath.OFF_CURVE_CUBIC, MathPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const mp = new MockPath2D();
    const p2 = p.addItemwise(p);
    p2.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 200, 200, 200, 200, 0], "op": "bezierCurveTo"},
        {"args": [0, 0], "op": "lineTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("test sub", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.ON_CURVE, MathPath.OFF_CURVE_CUBIC, MathPath.OFF_CURVE_CUBIC, MathPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const mp = new MockPath2D();
    const p2 = p.subItemwise(p);
    p2.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 0, 0, 0, 0, 0], "op": "bezierCurveTo"},
        {"args": [0, 0], "op": "lineTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("test mul", () => {
    const p = new MathPath(
      new MathArray(0, 0, 0, 100, 100, 100, 100, 0),
      [MathPath.ON_CURVE, MathPath.OFF_CURVE_CUBIC, MathPath.OFF_CURVE_CUBIC, MathPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const mp = new MockPath2D();
    const p2 = p.mulScalar(2);
    p2.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 200, 200, 200, 200, 0], "op": "bezierCurveTo"},
        {"args": [0, 0], "op": "lineTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

})
