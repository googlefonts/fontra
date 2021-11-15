import chai from "chai";
const expect = chai.expect;


import {addItemwise} from "../src/var-funcs.js";


describe("Varation functions Tests", () => {

  it("add arrays of ints", () => {
    const result = addItemwise([1, 2, 3], [4, 5, 6]);
    expect(result).to.deep.equal([5, 7, 9]);
  })

  it("add incompatible arrays of ints", () => {
    expect(() => addItemwise([1, 2, 3], [4, 5]))
      .to.throw("arrays have incompatible lengths: 3 != 2");
  })

  it("add arrays of strings", () => {
    const result = addItemwise(["1", "2"], ["1", "2"]);
    expect(result).to.deep.equal(["1", "2"]);
  })

  it("add incompatible arrays of strings", () => {
    expect(() => addItemwise(["a", "b"], ["a", "c"]))
      .to.throw("unexpected different strings: b != c");
  })

  it("add objects", () => {
    const result = addItemwise({a: 1, b: 2}, {b: 2, a: 1});
    expect(result).to.deep.equal({a: 2, b: 4});
  })

  it("add incompatible objects", () => {
    expect(() => addItemwise({a: 1, b: 2}, {b: 2}))
      .to.throw("objects have incompatible number of entries: 2 != 1");
  })

  it("add incompatible objects", () => {
    expect(() => addItemwise({a: 1, b: 2}, {b: 2, c: 3}))
      .to.throw("objects have incompatible key sets: a,b != b,c");
  })

  it("add nested objects", () => {
    const result = addItemwise({a: {x: 10}, b: 2}, {b: 2, a: {x: 20}});
    expect(result).to.deep.equal({a: {x: 30}, b: 4});
  })

  it("add nested arrays", () => {
    const result = addItemwise([[1, 2], 3, 4], [[5, 6], 7, 8]);
    expect(result).to.deep.equal([[6, 8], 10, 12]);
  })

  it("add array of objects", () => {
    const result = addItemwise([{x: 10}, 2], [{x: 20}, 5]);
    expect(result).to.deep.equal([{x: 30}, 7]);
  })

});
