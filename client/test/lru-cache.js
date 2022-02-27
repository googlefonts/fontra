import chai from "chai";
const expect = chai.expect;

import { LRUCache } from "../src/lru-cache.js";


describe("LRUCache Tests", () => {

  it("empty", () => {
    const lru = new LRUCache(4);
    expect(lru.map.size).to.equal(0);
    console.log(lru.head);
    console.log(lru.tail);
    expect(lru._dllLength()).to.equal(0);
  });

  it("put/get", () => {
    const lru = new LRUCache(4);
    lru.put("a", 1);
    lru.put("b", 2);
    expect(lru.map.size).to.equal(2);
    expect(lru._dllLength()).to.equal(lru.map.size);
    expect(lru.get("c")).to.equal(undefined);
    expect(lru.get("a")).to.equal(1);
    expect(lru.get("b")).to.equal(2);
    expect(lru.get("c")).to.equal(undefined);
    lru.put("c", 3);
    lru.put("d", 4);
    expect(lru.get("a")).to.equal(1);
    expect(lru.get("b")).to.equal(2);
    expect(lru.get("c")).to.equal(3);
    lru.put("e", 4);
    expect(lru.get("d")).to.equal(undefined);
    expect(lru.get("a")).to.equal(1);
    lru.put("f", 5);
    expect(lru.get("b")).to.equal(undefined);
    expect(lru.get("a")).to.equal(1);
  });

  it("delete", () => {
    const lru = new LRUCache(4);
    lru.put("a", 1);
    lru.put("b", 2);
    lru.put("c", 3);
    expect(Array.from(lru.map.keys())).to.deep.equal(["a", "b", "c"]);
    expect(lru._dllKeys()).to.deep.equal(["a", "b", "c"]);
    lru.delete("b");
    expect(Array.from(lru.map.keys())).to.deep.equal(["a", "c"]);
    expect(lru._dllKeys()).to.deep.equal(["a", "c"]);
    expect(lru._dllLength()).to.equal(2);
    lru.delete("a");
    expect(Array.from(lru.map.keys())).to.deep.equal(["c"]);
    expect(lru._dllKeys()).to.deep.equal(["c"]);
    expect(lru._dllLength()).to.equal(1);
    lru.delete("missing_key");
    expect(Array.from(lru.map.keys())).to.deep.equal(["c"]);
    expect(lru._dllKeys()).to.deep.equal(["c"]);
    expect(lru._dllLength()).to.equal(1);
    lru.delete("c");
    expect(Array.from(lru.map.keys())).to.deep.equal([]);
    expect(lru._dllKeys()).to.deep.equal([]);
    expect(lru._dllLength()).to.equal(0);
  });

});
