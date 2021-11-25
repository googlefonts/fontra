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

});
