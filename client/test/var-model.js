import chai from "chai";
const expect = chai.expect;

import { deepCompare, locationToString } from "../src/var-model.js";


describe("var-model tests", () => {

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
