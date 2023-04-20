import chai from "chai";
const expect = chai.expect;

import { enumerate } from "../src/fontra/client/core/utils.js";
import classesSchema from "../src/fontra/client/core/classes.json" assert { type: "json" };
import { getClassSchema } from "../src/fontra/client/core/classes.js";

describe("schema tests", () => {
  const testPaths = [
    [
      ["glyphs", "dict<VariableGlyph>"],
      ["<anything>", "VariableGlyph"],
      ["sources", "list<Source>"],
      [999, "Source"],
      ["location", "dict<float>"],
      ["<anything>", "float"],
    ],
    [
      ["glyphs", "dict<VariableGlyph>"],
      ["<anything>", "VariableGlyph"],
      ["layers", "list<Layer>"],
      [999, "Layer"],
      ["glyph", "StaticGlyph"],
      ["path", "PackedPath"],
      ["pointTypes", "list<PointType>"],
      [999, "PointType"],
    ],
    [
      ["glyphs", "dict<VariableGlyph>"],
      ["<anything>", "VariableGlyph"],
      ["layers", "list<Layer>"],
      [999, "Layer"],
      ["glyph", "StaticGlyph"],
      ["components", "list<Component>"],
      [999, "Component"],
      ["location", "dict<float>"],
      ["<anything>", "float"],
    ],
    [["nonExistingProperty", null]],
  ];

  for (const [testIndex, testPath] of enumerate(testPaths)) {
    it(`test path ${testIndex}`, async () => {
      const schema = await getClassSchema(classesSchema);
      let subjectType = schema["Font"]; // Root
      expect(subjectType.className).to.equal("Font");
      for (const [pathElement, expectedName] of testPath) {
        if (expectedName) {
          subjectType = subjectType.getSubType(pathElement);
          expect(subjectType.className).to.equal(expectedName);
        } else {
          expect(() => {
            subjectType.getSubType(pathElement);
          }).to.throw("Unknown subType nonExistingProperty of Font");
        }
      }
    });
  }
});
