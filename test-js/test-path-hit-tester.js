import chai from "chai";
const expect = chai.expect;

import { PathHitTester } from "../src/fontra/client/core/path-hit-tester.js";
import { VarPackedPath } from "../src/fontra/client/core/var-path.js";

describe("PathHitTester Tests", () => {
  it("bla 1", () => {
    const p = VarPackedPath.fromUnpackedContours([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
          { x: 200, y: 100 },
          { x: 250, y: 50, type: "quad" },
          { x: 200, y: 0 },
        ],
        isClosed: true,
      },
    ]);
    const pcf = new PathHitTester(p);
    let result;
    result = pcf.hitTest({ x: -30, y: 10 }, 20);
    expect(result).to.deep.equal({});
    result = pcf.hitTest({ x: 10, y: 10 }, 20);
    expect(result).to.deep.equal({ contourIndex: 0, segmentIndex: 0 });
    result = pcf.hitTest({ x: 100, y: 10 }, 20);
    expect(result).to.deep.equal({ contourIndex: 0, segmentIndex: 3 });
    result = pcf.hitTest({ x: 190, y: 10 }, 20);
    expect(result).to.deep.equal({ contourIndex: 0, segmentIndex: 2 });
    result = pcf.hitTest({ x: 190, y: 49 }, 20);
    expect(result).to.deep.equal({});
    result = pcf.hitTest({ x: 230, y: 49 }, 20);
    expect(result).to.deep.equal({ contourIndex: 0, segmentIndex: 2 });
  });
});
