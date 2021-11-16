import chai from "chai";
const expect = chai.expect;

import {
  VariationModel,
  deepCompare,
  locationToString,
  normalizeLocation,
  normalizeValue,
  supportScalar,
} from "../src/var-model.js";


describe("var-model tests", () => {

  describe("normalizeValue test", () => {
    it("misc", () => {
      expect(normalizeValue(400, [100, 400, 900])).to.equal(0.0);
      expect(normalizeValue(100, [100, 400, 900])).to.equal(-1.0);
      expect(normalizeValue(650, [100, 400, 900])).to.equal(0.5);
      expect(normalizeValue(0, [100, 400, 900])).to.equal(-1.0);
      expect(normalizeValue(1000, [100, 400, 900])).to.equal(1.0);
    });
  });

  describe("normalizeLocation tests", () => {
    it("-1,0,1", () => {
      const axes = {"wght": [100, 400, 900]};
      expect(normalizeLocation({"wght": 400}, axes)).to.deep.equal({'wght': 0.0});
      expect(normalizeLocation({"wght": 100}, axes)).to.deep.equal({'wght': -1.0});
      expect(normalizeLocation({"wght": 900}, axes)).to.deep.equal({'wght': 1.0});
      expect(normalizeLocation({"wght": 650}, axes)).to.deep.equal({'wght': 0.5});
      expect(normalizeLocation({"wght": 1000}, axes)).to.deep.equal({'wght': 1.0});
      expect(normalizeLocation({"wght": 0}, axes)).to.deep.equal({'wght': -1.0});
    });

    it("0,0,1", () => {
      const axes = {"wght": [0, 0, 1000]};
      expect(normalizeLocation({"wght": 0}, axes)).to.deep.equal({'wght': 0.0});
      expect(normalizeLocation({"wght": -1}, axes)).to.deep.equal({'wght': 0.0});
      expect(normalizeLocation({"wght": 1000}, axes)).to.deep.equal({'wght': 1.0});
      expect(normalizeLocation({"wght": 500}, axes)).to.deep.equal({'wght': 0.5});
      expect(normalizeLocation({"wght": 1001}, axes)).to.deep.equal({'wght': 1.0});
    });

    it("0,1,1", () => {
      const axes = {"wght": [0, 1000, 1000]};
      expect(normalizeLocation({"wght": 0}, axes)).to.deep.equal({'wght': -1.0});
      expect(normalizeLocation({"wght": -1}, axes)).to.deep.equal({'wght': -1.0});
      expect(normalizeLocation({"wght": 500}, axes)).to.deep.equal({'wght': -0.5});
      expect(normalizeLocation({"wght": 1000}, axes)).to.deep.equal({'wght': 0.0});
      expect(normalizeLocation({"wght": 1001}, axes)).to.deep.equal({'wght': 0.0});
    });

  });

  describe("supportScalar tests", () => {

    it("supportScalar", () => {
      expect(supportScalar({}, {})).to.equal(1.0);
      expect(supportScalar({'wght':.2}, {})).to.equal(1.0);
      expect(supportScalar({'wght':.2}, {'wght':[0,2,3]})).to.equal(0.1);
      expect(supportScalar({'wght':2.5}, {'wght':[0,2,4]})).to.equal(0.75);
      expect(supportScalar({'wght':2.5, 'wdth':0}, {'wght':[0,2,4], 'wdth':[-1,0,+1]})).to.equal(0.75);
      expect(supportScalar({'wght':2.5, 'wdth':.5}, {'wght':[0,2,4], 'wdth':[-1,0,+1]}, false)).to.equal(0.375);
      expect(supportScalar({'wght':2.5, 'wdth':0}, {'wght':[0,2,4], 'wdth':[-1,0,+1]})).to.equal(0.75);
      expect(supportScalar({'wght':2.5, 'wdth':.5}, {'wght':[0,2,4], 'wdth':[-1,0,+1]})).to.equal(0.75);
    });

  });

  describe("locationToString tests", () => {
    it("empty location", () => {
      expect(locationToString({})).to.equal("{}");
      expect(locationToString({a:1, b:2})).to.equal('{"a":1,"b":2}');
      expect(locationToString({b:2, a:1})).to.equal('{"a":1,"b":2}');
    })
  });

  describe("deepCompare tests", () => {
    it("deepCompare scalars", () => {
      expect(deepCompare(1, 2)).to.equal(-1);
      expect(deepCompare(9, 10)).to.equal(-1);
      expect(deepCompare(3, 2)).to.equal(1);
      expect(deepCompare(3, 3)).to.equal(0);
      expect(deepCompare("a", "b")).to.equal(-1);
      expect(deepCompare("a", "aa")).to.equal(-1);
      expect(deepCompare("aa", "a")).to.equal(1);
      expect(deepCompare("aaa", "aaa")).to.equal(0);
      expect(deepCompare("9", "10")).to.equal(1);
    });

    it("deepCompare empty array", () => {
      expect(deepCompare([], [])).to.equal(0);
    });

    it("deepCompare string array", () => {
      expect(deepCompare(["a", "aa"], ["a", "aa"])).to.equal(0);
      expect(deepCompare(["a", "aa"], ["a", "aaa"])).to.equal(-1);
      expect(deepCompare(["a", "aaaa"], ["a", "aaa"])).to.equal(1);
    });

    it("deepCompare numeric array", () => {
      expect(deepCompare([1, 2], [1, 2])).to.equal(0);
      expect(deepCompare([1, 2], [2, 2])).to.equal(-1);
      expect(deepCompare([1, 2], [1, 3])).to.equal(-1);
      expect(deepCompare([1, 4], [1, 3])).to.equal(1);
      expect(deepCompare([2, 2], [1, 3])).to.equal(1);
    });

    it("deepCompare numeric array", () => {
      expect(deepCompare([1, 2], [1, 2])).to.equal(0);
      expect(deepCompare([1, 2], [2, 2])).to.equal(-1);
      expect(deepCompare([1, 2], [1, 2, 3])).to.equal(-1);
      expect(deepCompare([1, 2], [1, 3])).to.equal(-1);
      expect(deepCompare([1, 4], [1, 3])).to.equal(1);
      expect(deepCompare([2, 2], [1, 3])).to.equal(1);
      const l = [[1, 2, 3], [1, 2]];
      l.sort(deepCompare);
      expect(l).to.deep.equal([[1, 2], [1, 2, 3]]);
    });

    it("deepCompare nested numeric array", () => {
      expect(deepCompare([1, [3, 4]], [1, [3, 4]])).to.equal(0);
      expect(deepCompare([1, [3, 4]], [1, [3, 5]])).to.equal(-1);
      expect(deepCompare([1, [3, 4]], [1, [3, 3]])).to.equal(1);
    });

    it("deepCompare throw TypeError", () => {
      expect(() => deepCompare({}, [])).to.throw(TypeError);
      expect(() => deepCompare(123, "123")).to.throw(TypeError);
    });

  });

});
