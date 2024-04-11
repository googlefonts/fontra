import { expect, use } from "chai";
import chaiAlmost from "chai-almost";
use(chaiAlmost());

import {
  Transform,
  decomposedFromTransform,
  decomposedToTransform,
} from "../src/fontra/client/core/transform.js";
import { parametrize } from "./test-support.js";

describe("transform tests", () => {
  it("identity", () => {
    const t = new Transform();
    expect(t.toArray()).to.deep.equal([1, 0, 0, 1, 0, 0]);
  });

  it("constructor", () => {
    const t = new Transform(2, 0.2, 0.5, 0.5, 0.1, 2.3);
    expect(t.toArray()).to.deep.equal([2, 0.2, 0.5, 0.5, 0.1, 2.3]);
  });

  it("transformPoint", () => {
    let t = new Transform();
    t = t.scale(2.5, 5.5);
    expect(t.transformPoint(100, 100)).to.deep.equal([250, 550]);
  });

  it("translate", () => {
    let t = new Transform();
    t = t.translate(20, 30);
    expect(t.toArray()).to.deep.equal([1, 0, 0, 1, 20, 30]);
  });

  it("scale", () => {
    const t = new Transform();
    expect(t.scale(5).toArray()).to.deep.equal([5, 0, 0, 5, 0, 0]);
    expect(t.scale(5, 6).toArray()).to.deep.equal([5, 0, 0, 6, 0, 0]);
  });

  it("rotate", () => {
    const t = new Transform();
    expect(t.rotate(Math.PI / 2).toArray()).to.deep.equal([0, 1, -1, 0, 0, 0]);
  });

  it("skew", () => {
    const t = new Transform();
    expect(t.skew(Math.PI / 4).toArray()).to.deep.equal([
      1, 0, 0.9999999999999999, 1, 0, 0,
    ]);
  });

  it("transform", () => {
    const t = new Transform(2, 0, 0, 3, 1, 6);
    expect(
      t.transform({ xx: 4, xy: 3, yx: 2, yy: 1, dx: 5, dy: 6 }).toArray()
    ).to.deep.equal([8, 9, 4, 3, 11, 24]);
    expect(t.transform([4, 3, 2, 1, 5, 6]).toArray()).to.deep.equal([
      8, 9, 4, 3, 11, 24,
    ]);
  });

  it("reverseTransform", () => {
    let t = new Transform(2, 0, 0, 3, 1, 6);
    t = t.reverseTransform([4, 3, 2, 1, 5, 6]);
    expect(t.toArray()).to.deep.equal([8, 6, 6, 3, 21, 15]);
    t = new Transform(4, 3, 2, 1, 5, 6);
    t = t.transform([2, 0, 0, 3, 1, 6]);
    expect(t.toArray()).to.deep.equal([8, 6, 6, 3, 21, 15]);
  });

  it("inverse", () => {
    const t = new Transform().translate(2, 3).scale(4, 5);
    expect(t.transformPoint(10, 20)).to.deep.equal([42, 103]);
    const it = t.inverse();
    expect(it.transformPoint(42, 103)).to.deep.equal([10, 20]);
  });

  it("decomposedFromTransform", () => {
    const t = new Transform().scale(4, 5);
    const d = decomposedFromTransform(t);
    expect(d.scaleX).to.deep.equal(4);
    expect(d.scaleY).to.deep.equal(5);
  });

  it("decomposedToTransform", () => {
    const t = {
      translateX: 2,
      translateY: 3,
      rotation: 0,
      scaleX: 4,
      scaleY: 5,
      skewX: 0,
      skewY: 0,
      tCenterX: 0,
      tCenterY: 0,
    };
    const d = decomposedToTransform(t);
    expect(d.toArray()).to.deep.equal([4, 0, 0, 5, 2, 3]);
  });

  it("toDecomposed", () => {
    const t = new Transform().translate(2, 3).scale(4, 5);
    expect(decomposedToTransform(t.toDecomposed()).toArray()).to.deep.equal([
      4, 0, 0, 5, 2, 3,
    ]);
  });
});

const decomposedIdentity = {
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  tCenterX: 0,
  tCenterY: 0,
};

describe("DecomposedTransform", () => {
  parametrize(
    "DecomposedTransform tests",
    [
      { scaleX: 1, scaleY: 0 },
      { scaleX: 0, scaleY: 1 },
      { scaleX: 1, scaleY: 0, rotation: 30 },
      { scaleX: 0, scaleY: 1, rotation: 30 },
      { scaleX: 1, scaleY: 1 },
      { scaleX: -1, scaleY: 1 },
      { scaleX: 1, scaleY: -1 },
      { scaleX: -1, scaleY: -1 },
      { rotation: 90 },
      { rotation: -90 },
      { skewX: 45 },
      { skewY: 45 },
      { scaleX: -1, skewX: 45 },
      { scaleX: -1, skewY: 45 },
      { scaleY: -1, skewX: 45 },
      { scaleY: -1, skewY: 45 },
      { scaleX: -1, skewX: 45, rotation: 30 },
      { scaleX: -1, skewY: 45, rotation: 30 },
      { scaleY: -1, skewX: 45, rotation: 30 },
      { scaleY: -1, skewY: 45, rotation: 30 },
      { scaleX: -1, skewX: 45, rotation: -30 },
      { scaleX: -1, skewY: 45, rotation: -30 },
      { scaleY: -1, skewX: 45, rotation: -30 },
      { scaleY: -1, skewY: 45, rotation: -30 },
      { scaleX: -2, skewX: 45, rotation: 30 },
      { scaleX: -2, skewY: 45, rotation: 30 },
      { scaleY: -2, skewX: 45, rotation: 30 },
      { scaleY: -2, skewY: 45, rotation: 30 },
      { scaleX: -2, skewX: 45, rotation: -30 },
      { scaleX: -2, skewY: 45, rotation: -30 },
      { scaleY: -2, skewX: 45, rotation: -30 },
      { scaleY: -2, skewY: 45, rotation: -30 },
    ],
    (decomposed) => {
      decomposed = { ...decomposedIdentity, ...decomposed };
      expect(
        decomposedToTransform(
          decomposedFromTransform(decomposedToTransform(decomposed))
        )
      ).to.deep.almost.equals(decomposedToTransform(decomposed));
    }
  );
});
