import { expect } from "chai";
import {
  chordLengthParameterize,
  computeMaxError,
  cubicCurve,
  generateBezier,
  fitCubic,
  newtonRhapsonRootFind,
} from "../src/fontra/client/core/fit-cubic.js";

import { Bezier } from "bezier-js";
import { normalizeVector } from "../src/fontra/client/core/vector.js";

describe("chordLengthParameterize", () => {
  it("parameterize the given points", () => {
    const points = [
      { x: -28, y: 138 },
      { x: 72, y: 188 },
      { x: 118, y: 190 },
      { x: 192, y: 160 },
      { x: 262, y: 134 },
      { x: 296, y: 86 },
      { x: 318, y: 18 },
    ];
    const parameters = chordLengthParameterize(points);
    expect(parameters).deep.equal([
      0.0, 0.25257093967929206, 0.3565860188512732, 0.5369718939837534,
      0.7056620562778243, 0.8385441379333622, 1.0,
    ]);
  });
});

describe("cubicCurve", () => {
  const p1 = { x: -28, y: 138 };
  const p2 = { x: 98.70185667874232, y: 264.70185667874233 };
  const p3 = { x: 274.3331007115815, y: 149.00069786525552 };
  const p4 = { x: 318, y: 18 };
  it("Returns an intermediate point relevant to t value", () => {
    expect(cubicCurve(p1, p2, p3, p4, 0.2)).deep.equal({
      x: 52.44549063294889,
      y: 186.74957995970166,
    });
  });
  it("Returns the first point when t at zero", () => {
    expect(cubicCurve(p1, p2, p3, p4, 0)).deep.equal({
      x: -28,
      y: 138,
    });
  });
  it("Returns the last point when t at the end", () => {
    expect(cubicCurve(p1, p2, p3, p4, 1)).deep.equal({
      x: 318,
      y: 18,
    });
  });
});

describe("computeMaxError", () => {
  it("should compute max error", () => {
    const points = [
      { x: -28, y: 138 },
      { x: 72, y: 188 },
      { x: 118, y: 190 },
      { x: 192, y: 160 },
      { x: 262, y: 134 },
      { x: 296, y: 86 },
      { x: 318, y: 18 },
    ];
    const bezier = new Bezier([
      { x: -28, y: 138 },
      { x: 98.70185668, y: 264.70185668 },
      { x: 274.33310071, y: 149.00069787 },
      { x: 318, y: 18 },
    ]);
    const maxError = computeMaxError(
      points,
      bezier,
      [
        0.0, 0.25257093967929206, 0.3565860188512732, 0.5369718939837534,
        0.7056620562778243, 0.8385441379333622, 1.0,
      ]
    );
    expect(maxError).deep.equals([251.76193388154175, 4]);
  });
});

describe("bezierqprime", () => {
  it("cubic bezier first derivative at t", () => {
    const { x, y } = new Bezier([
      { x: -28, y: 0 },
      { x: 16.276295129835724, y: 44.276295129835724 },
      { x: 182.32886105475268, y: 425.0134168357419 },
      { x: 318, y: 18 },
    ]).derivative(0.8718749216671997);

    expect({ x, y }).deep.equal({
      x: 422.87567451044663,
      y: -670.8219354679883,
    });
  });
});

describe("bezierqprimeprime", () => {
  it("cubic bezier second derivative at t", () => {
    const { x, y } = new Bezier([
      { x: -28, y: 0 },
      { x: 16.276295129835724, y: 44.276295129835724 },
      { x: 182.32886105475268, y: 425.0134168357419 },
      { x: 318, y: 18 },
    ]).dderivative(0.8718749216671997);

    expect({ x, y }).deep.equal({
      x: -65.31726020004677,
      y: -3862.265215939896,
    });
  });
});

describe("fitCubic", () => {
  it("should create a bezier curve by given points", () => {
    const points = [
      { x: -28, y: 0 },
      { x: 72, y: 188 },
      { x: 118, y: 190 },
      { x: 192, y: 160 },
      { x: 262, y: 134 },
      { x: 296, y: 86 },
      { x: 318, y: 18 },
    ];
    const leftTangent = normalizeVector({ x: 1, y: 1 });
    const rightTangent = normalizeVector({ x: -1, y: 3 });
    const segment = fitCubic(points, leftTangent, rightTangent, 800);
    expect(segment.points.map(({ x, y }) => ({ x, y }))).deep.equal([
      { x: -28, y: 0 },
      { x: 3.1182243877227442, y: 31.118224387722744 },
      { x: 180.23714421445916, y: 431.2885673566225 },
      { x: 318, y: 18 },
    ]);
  });
});

describe("generateBezier", () => {
  it("generates a bezier curve by given t values", () => {
    let [b1, b2, b3, b4] = generateBezier(
      [
        { x: -28, y: 138 },
        { x: 72, y: 188 },
        { x: 118, y: 190 },
        { x: 192, y: 160 },
        { x: 262, y: 134 },
        { x: 296, y: 86 },
        { x: 318, y: 18 },
      ],
      [
        0.0, 0.25257093967929206, 0.3565860188512732, 0.5369718939837534,
        0.7056620562778243, 0.8385441379333622, 1.0,
      ],

      { x: 0.7071067811865475, y: 0.7071067811865475 },
      { x: -0.31622776601683794, y: 0.9486832980505138 }
    ).points;

    expect(b1).deep.equal({ x: -28, y: 138 });
    expect(b2).deep.equal({ x: 98.70185667874236, y: 264.7018566787424 });
    expect(b3).deep.equal({ x: 274.3331007115815, y: 149.00069786525546 });
    expect(b4).deep.equal({ x: 318, y: 18 });

    [b1, b2, b3, b4] = generateBezier(
      [
        { x: -28, y: 0 },
        { x: 72, y: 188 },
        { x: 118, y: 190 },
        { x: 192, y: 160 },
        { x: 262, y: 134 },
        { x: 296, y: 86 },
        { x: 318, y: 18 },
      ],
      [
        0.0, 0.3603797149797222, 0.43632563266986446, 0.5189086170461938,
        0.6924786624363051, 0.822507279460892, 1.0,
      ],

      { x: 0.7071067811865475, y: 0.7071067811865475 },
      { x: -0.31622776601683794, y: 0.9486832980505138 }
    ).points;

    expect(b1).deep.equal({ x: -28, y: 0 });
    expect(b2).deep.equal({ x: 134.85620891904577, y: 162.85620891904577 });
    expect(b3).deep.equal({ x: 235.0993450823367, y: 266.70196475298985 });
    expect(b4).deep.equal({ x: 318, y: 18 });
  });
});

describe("newtonRaphsonRootFind", () => {
  expect(
    newtonRhapsonRootFind(
      new Bezier(
        { x: -28, y: 0 },
        { x: 16.276295129835724, y: 44.276295129835724 },
        { x: 182.32886105475268, y: 425.0134168357419 },
        { x: 318, y: 18 }
      ),
      { x: 262, y: 134 },
      0.8718749216671997
    )
  ).equal(0.8744228180105965);
});
