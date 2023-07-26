import { expect } from "chai";
import { chordLengthParameterize } from "../src/fontra/client/core/fit-cubic.js";

describe("fitCubic", () => {
  it("creates cubic curve by given points", () => {
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
