import chai from "chai";
const expect = chai.expect;

import { getCmapWrapper, makeReverseMapping } from "../src/fontra/client/core/cmap.js";
import { enumerate } from "../src/fontra/client/core/utils.js";


const makeReverseMapping_testData = [
  [{}, {}],
  [{1: "one"}, {"one": [1]}],
  [{1: "one", 2: "two"}, {"one": [1], "two": [2]}],
  [{1: "double", 2: "double"}, {"double": [1, 2]}],
  [{2: "double", 1: "double"}, {"double": [1, 2]}],
];


describe("getCmapWrapper tests", () => {

  for (const [i, [cmap, expectedRevCmap]] of enumerate(makeReverseMapping_testData)) {
    it("makeReverseMapping test empty", () => {
      expect(makeReverseMapping(cmap)).to.deep.equal(expectedRevCmap);
    });
  }

  it("makeReverseMapping test simple", () => {
    const cmap = {};
    expect(makeReverseMapping(cmap)).to.deep.equal({});
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
    const revCmap = {"space": [32], "double": [33, 34]};
    const cmap = getCmapWrapper(cmapData, revCmap);

    cmap[32] = "spacey";
    cmap[34] = "doubly";
    expect(cmapData).to.deep.equal({"32": "spacey", "33": "double", "34": "doubly"});
    expect(revCmap).to.deep.equal({"spacey": [32], "double": [33], "doubly": [34]});
  });

  it("getCmapWrapper delete items", () => {
    const cmapData = {"32": "space", "33": "double", "34": "double"};
    const revCmap = {"space": [32], "double": [33, 34]};
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
