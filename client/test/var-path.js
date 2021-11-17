import chai from "chai";
const expect = chai.expect;

import VarPath from "../src/var-path.js";
import VarArray from "../src/var-array.js";
import { Transform } from "../src/transform.js";


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


describe("VarPath Tests", () => {
  
  it("empty copy", () => {
    const p = new VarPath();
    const p2 = p.copy();
    const mp = new MockPath2D();
    expect(p2.coordinates).to.deep.equal([]);
    expect(p2.pointTypes).to.deep.equal([]);
    expect(p2.contours).to.deep.equal([]);
    p2.drawToPath(mp);
    expect(mp.items).to.deep.equal([]);
  })

  it("constructor", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    expect(p.coordinates).to.deep.equal([0, 0, 0, 100, 100, 100, 100, 0]);
    expect(p.pointTypes).to.deep.equal([VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE]);
    expect(p.contours).to.deep.equal([{endPoint: 3, isClosed: true}]);
  })

  it("copy", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const p2 = p.copy();
    // modify original
    p.coordinates[0] = 1000;
    p.pointTypes[0] = VarPath.OFF_CURVE_QUAD
    p.contours[0].isClosed = false;
    expect(p2.coordinates).to.deep.equal([0, 0, 0, 100, 100, 100, 100, 0]);
    expect(p2.pointTypes).to.deep.equal([VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE]);
    expect(p2.contours).to.deep.equal([{endPoint: 3, isClosed: true}]);
  })

  it("draw", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE],
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

  it("open path", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: false}],
    );
    const mp = new MockPath2D();
    p.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 100], "op": "lineTo"},
        {"args": [100, 100], "op": "lineTo"},
        {"args": [100, 0], "op": "lineTo"},
      ],
    );
  })

  it("closed path dangling off curves", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.OFF_CURVE_QUAD, VarPath.ON_CURVE, VarPath.OFF_CURVE_QUAD, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const mp = new MockPath2D();
    p.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 100], "op": "moveTo"},
        {"args": [100, 100, 100, 0], "op": "bezierQuadTo"},
        {"args": [0, 0, 0, 100], "op": "bezierQuadTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("open path dangling off curves", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.OFF_CURVE_QUAD, VarPath.ON_CURVE, VarPath.OFF_CURVE_QUAD, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: false}],
    );
    const mp = new MockPath2D();
    p.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 100], "op": "moveTo"},
        {"args": [100, 100, 100, 0], "op": "bezierQuadTo"},
      ],
    );
  })

  it("quad", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.OFF_CURVE_QUAD, VarPath.OFF_CURVE_QUAD, VarPath.OFF_CURVE_QUAD],
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

  it("quad blob", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.OFF_CURVE_QUAD, VarPath.OFF_CURVE_QUAD, VarPath.OFF_CURVE_QUAD, VarPath.OFF_CURVE_QUAD],
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

  it("cubic", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.OFF_CURVE_CUBIC, VarPath.OFF_CURVE_CUBIC, VarPath.ON_CURVE],
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

  it("add", () => {
    const p1 = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.OFF_CURVE_CUBIC, VarPath.OFF_CURVE_CUBIC, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const p2 = p1.copy();
    const p3 = p1.addItemwise(p2);
    const mp = new MockPath2D();
    p3.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 200, 200, 200, 200, 0], "op": "bezierCurveTo"},
        {"args": [0, 0], "op": "lineTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("sub", () => {
    const p1 = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.OFF_CURVE_CUBIC, VarPath.OFF_CURVE_CUBIC, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const p2 = p1.copy();
    const p3 = p1.subItemwise(p2);
    const mp = new MockPath2D();
    p3.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 0, 0, 0, 0, 0], "op": "bezierCurveTo"},
        {"args": [0, 0], "op": "lineTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("mul", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.OFF_CURVE_CUBIC, VarPath.OFF_CURVE_CUBIC, VarPath.ON_CURVE],
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

  it("pen-ish methods", () => {
    const p = new VarPath();
    const mp = new MockPath2D();
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.curveTo(30, 130, 70, 130, 100, 100);
    p.qCurveTo(130, 70, 130, 30, 100, 0);
    p.closePath();
    p.drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 100], "op": "lineTo"},
        {"args": [30, 130, 70, 130, 100, 100], "op": "bezierCurveTo"},
        {"args": [130, 70, 130, 50], "op": "bezierQuadTo"},
        {"args": [130, 30, 100, 0], "op": "bezierQuadTo"},
        {"args": [0, 0], "op": "lineTo"},
        {"args": [], "op": "closePath"},
      ],
    );
  })

  it("iterPoints", () => {
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.OFF_CURVE_CUBIC, VarPath.OFF_CURVE_CUBIC, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: true}],
    );
    const points = [];
    for (const pt of p.iterPoints()) {
      points.push(pt)
    }
    expect(points).to.deep.equal(
      [
        {x: 0, y: 0, type: 0, smooth: false},
        {x: 0, y: 100, type: 2, smooth: false},
        {x: 100, y: 100, type: 2, smooth: false},
        {x: 100, y: 0, type: 0, smooth: false},
      ],
    );
  })

  it("transform", () => {
    const t = new Transform().scale(2);
    const p = new VarPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE, VarPath.ON_CURVE],
      [{endPoint: 3, isClosed: false}],
    );
    const mp = new MockPath2D();
    p.transformed(t).drawToPath(mp);
    expect(mp.items).to.deep.equal(
      [
        {"args": [0, 0], "op": "moveTo"},
        {"args": [0, 200], "op": "lineTo"},
        {"args": [200, 200], "op": "lineTo"},
        {"args": [200, 0], "op": "lineTo"},
      ],
    );
  });

})
