import { expect } from "chai";
import {
  chordLengthParameterize,
  cubicCurve,
} from "../src/fontra/client/core/fit-cubic.js";

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
