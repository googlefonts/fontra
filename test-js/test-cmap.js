import chai from "chai";
const expect = chai.expect;

import {
  getCmapWrapper,
  getReverseCmapWrapper,
  makeMappingFromReverseMapping,
  makeReverseMapping,
} from "../src/fontra/client/core/cmap.js";
import { enumerate } from "../src/fontra/client/core/utils.js";


describe("cmap tests", () => {

  const makeReverseMapping_testData = [
    [{}, {}],
    [{1: "one"}, {"one": [1]}],
    [{1: "one", 2: "two"}, {"one": [1], "two": [2]}],
    [{1: "double", 2: "double"}, {"double": [1, 2]}],
    [{2: "double", 1: "double"}, {"double": [1, 2]}],
  ];

  for (const [i, [cmap, expectedRevCmap]] of enumerate(makeReverseMapping_testData)) {
    it(`makeReverseMapping test ${i}`, () => {
      expect(makeReverseMapping(cmap)).to.deep.equal(expectedRevCmap);
    });
  }

  const makeMappingFromReverseMapping_testData = [
    [{}, {}, true, null],
    [{"one": [1]}, {1: "one"}, true, null],
    [{"one": [1], "two": [2]}, {1: "one", 2: "two"}, true, null],
    [{"double": [1, 2]}, {1: "double", 2: "double"}, true, null],
    [{"one": [1], "two": [1]}, null, true, "duplicate code point"],
    [{"one": [1], "two": [1]}, {1: "one"}, false, null],
    [{"two": [1], "one": [1]}, {1: "one"}, false, null],
  ];

  for (const [i, [revCmap, expectedCmap, strict, error]] of enumerate(makeMappingFromReverseMapping_testData)) {
    it(`makeMappingFromReverseMapping test ${i}`, () => {
      if (!error) {
        expect(makeMappingFromReverseMapping(revCmap, strict)).to.deep.equal(expectedCmap);
      } else {
        expect(() => makeMappingFromReverseMapping(revCmap, strict)).to.throw(error);
      }
    });
  }

  it("makeReverseMapping test simple", () => {
    const cmap = {};
    expect(makeReverseMapping(cmap)).to.deep.equal({});
  });

  it("getReverseCmapWrapper add items", () => {
    const cmap = {};
    const revCmapData = {};
    const revCmap = getReverseCmapWrapper(revCmapData, cmap);

    revCmap["space"] = [32];
    revCmap["double"] = [33, 34];

    expect(cmap).to.deep.equal({"32": "space", "33": "double", "34": "double"});
    expect(revCmapData).to.deep.equal({"space": [32], "double": [33, 34]});
  });

  it("getReverseCmapWrapper replace items", () => {
    const cmap = {"32": "space", "33": "test"};
    const revCmapData = makeReverseMapping(cmap);
    const revCmap = getReverseCmapWrapper(revCmapData, cmap);

    revCmap["space"] = [32, 34];
    expect(cmap).to.deep.equal({"32": "space", "33": "test", "34": "space"});
    expect(revCmap).to.deep.equal({"space": [32, 34], "test": [33]});
  });

  it("getReverseCmapWrapper replace items with same", () => {
    const cmap = {"32": "space", "33": "test"};
    const revCmapData = makeReverseMapping(cmap);
    const revCmap = getReverseCmapWrapper(revCmapData, cmap);

    revCmap["space"] = [32];
    revCmap["test"] = [33];
    expect(cmap).to.deep.equal({"32": "space", "33": "test"});
    expect(revCmap).to.deep.equal({"space": [32], "test": [33]});
  });

  it("getReverseCmapWrapper delete items", () => {
    const cmap = {"32": "space", "33": "test"};
    const revCmapData = makeReverseMapping(cmap);
    const revCmap = getReverseCmapWrapper(revCmapData, cmap);

    delete revCmap["space"];
    expect(cmap).to.deep.equal({"33": "test"});
    expect(revCmap).to.deep.equal({"test": [33]});

    delete revCmap["test"];
    expect(cmap).to.deep.equal({});
    expect(revCmap).to.deep.equal({});
  });

  it("getCmapWrapper add items", () => {
    const cmapData = {};
    const revCmap = {};
    const cmap = getCmapWrapper(cmapData, revCmap);

    cmap[32] = "space";
    cmap[33] = "double";
    cmap[34] = "double";
    expect(cmapData).to.deep.equal({"32": "space", "33": "double", "34": "double"});
    expect(revCmap).to.deep.equal({"space": [32], "double": [33, 34]});
  });

  it("getCmapWrapper replace items", () => {
    const cmapData = {"32": "space", "33": "double", "34": "double"};
    const revCmap = makeReverseMapping(cmapData);
    const cmap = getCmapWrapper(cmapData, revCmap);

    cmap[32] = "spacey";
    cmap[34] = "doubly";
    expect(cmapData).to.deep.equal({"32": "spacey", "33": "double", "34": "doubly"});
    expect(revCmap).to.deep.equal({"spacey": [32], "double": [33], "doubly": [34]});
  });

  it("getCmapWrapper replace items with same", () => {
    const cmapData = {"32": "space", "33": "double", "34": "double"};
    const revCmap = makeReverseMapping(cmapData);
    const cmap = getCmapWrapper(cmapData, revCmap);

    cmap[32] = "space";
    cmap[34] = "double";
    expect(cmapData).to.deep.equal({"32": "space", "33": "double", "34": "double"});
    expect(revCmap).to.deep.equal({"space": [32], "double": [33, 34]});
  });

  it("getCmapWrapper delete items", () => {
    const cmapData = {"32": "space", "33": "double", "34": "double"};
    const revCmap = makeReverseMapping(cmapData);
    const cmap = getCmapWrapper(cmapData, revCmap);

    delete cmap[32];
    expect(cmapData).to.deep.equal({"33": "double", "34": "double"});
    expect(revCmap).to.deep.equal({"double": [33, 34]});

    delete cmap[33];
    expect(cmapData).to.deep.equal({"34": "double"});
    expect(revCmap).to.deep.equal({"double": [34]});

    delete cmap[34];
    expect(cmapData).to.deep.equal({});
    expect(revCmap).to.deep.equal({});
  });

  it("getCmapWrapper add items, ensure sorted", () => {
    const cmapData = {};
    const revCmap = {};
    const cmap = getCmapWrapper(cmapData, revCmap);

    cmap[35] = "double";
    expect(revCmap).to.deep.equal({"double": [35]});
    cmap[33] = "double";
    expect(revCmap).to.deep.equal({"double": [33, 35]});
    cmap[34] = "double";
    expect(revCmap).to.deep.equal({"double": [33, 34, 35]});
    expect(cmapData).to.deep.equal({"33": "double", "34": "double", "35": "double"});
  });

});
