import chai from "chai";
const expect = chai.expect;
import fs from "fs";

import {
  ChangeCollector,
  applyChange,
  consolidateChanges,
} from "../src/fontra/client/core/changes.js";


import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)


describe("Changes Tests", () => {

  const test_data_path = join(dirname(__dirname), "test-common/apply-change-test-data.json");
  const test_data = JSON.parse(fs.readFileSync(test_data_path, "utf8"));
  const inputData = test_data["inputData"];
  const tests = test_data["tests"];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testName = test["testName"];
    const inputDataName = test["inputDataName"];
    const expectedData = test["expectedData"];

    const subject = copyObject(inputData[inputDataName]);
    it(`Apply Changes test #${i} -- ${testName}`, () => {
      applyChange(subject, test["change"]);
      expect(subject).to.deep.equal(expectedData);
    });
  }

});


const consolidateChangesTestCases = [
  {
    "testName": "no-op",
    "changes": {"f": "=", "a": [0, 0]},
    "prefixPath": undefined,
    "consolidated": {"f": "=", "a": [0, 0]},
  },
  {
    "testName": "no-op + empty p",
    "changes": {"p": [], "f": "=", "a": [0, 0]},
    "prefixPath": undefined,
    "consolidated": {"f": "=", "a": [0, 0]},
  },
  {
    "testName": "no-op + prefix",
    "changes": {"f": "=", "a": [0, 0]},
    "prefixPath": ["element"],
    "consolidated": {"p": ["element"], "f": "=", "a": [0, 0]},
  },
  {
    "testName": "prefix + p",
    "changes": {"p": ["sub"], "f": "=", "a": [0, 0]},
    "prefixPath": ["element"],
    "consolidated": {"p": ["element", "sub"], "f": "=", "a": [0, 0]},
  },
  {
    "testName": "single change",
    "changes": [{"f": "=", "a": [0, 0]}],
    "prefixPath": undefined,
    "consolidated": {"f": "=", "a": [0, 0]},
  },
  {
    "testName": "single change + prefix",
    "changes": [{"f": "=", "a": [0, 0]}],
    "prefixPath": ["element"],
    "consolidated": {"p": ["element"], "f": "=", "a": [0, 0]},
  },
  {
    "testName": "two changes",
    "changes": [{"f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}],
    "prefixPath": undefined,
    "consolidated": {"c": [{"f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}]},
  },
  {
    "testName": "two changes + empty p",
    "changes": [{"p": [], "f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}],
    "prefixPath": undefined,
    "consolidated": {"c": [{"f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}]},
  },
  {
    "testName": "two changes + prefix",
    "changes": [{"f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}],
    "prefixPath": ["element"],
    "consolidated": {"p": ["element"], "c": [{"f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}]},
  },
  {
    "testName": "two changes + prefix + different p 1",
    "changes": [{"f": "=", "a": [0, 0]}, {"p": ["sub2"], "f": "=", "a": [1, 2]}],
    "prefixPath": ["element"],
    "consolidated": {"p": ["element"], "c": [
      {"f": "=", "a": [0, 0]},
      {"p": ["sub2"], "f": "=", "a": [1, 2]},
    ]},
  },
  {
    "testName": "two changes + prefix + different p 1.1; delete empty p",
    "changes": [{"p": [], "f": "=", "a": [0, 0]}, {"p": ["sub2"], "f": "=", "a": [1, 2]}],
    "prefixPath": ["element"],
    "consolidated": {"p": ["element"], "c": [
      {"f": "=", "a": [0, 0]},
      {"p": ["sub2"], "f": "=", "a": [1, 2]},
    ]},
  },
  {
    "testName": "two changes + prefix + different p 2",
    "changes": [{"p": ["sub1"], "f": "=", "a": [0, 0]}, {"p": ["sub2"], "f": "=", "a": [1, 2]}],
    "prefixPath": ["element"],
    "consolidated": {"p": ["element"], "c": [
      {"p": ["sub1"], "f": "=", "a": [0, 0]},
      {"p": ["sub2"], "f": "=", "a": [1, 2]},
    ]},
  },
  {
    "testName": "two changes + prefix + same p",
    "changes": [{"p": ["sub"], "f": "=", "a": [0, 0]}, {"p": ["sub"], "f": "=", "a": [1, 2]}],
    "prefixPath": ["element"],
    "consolidated": {"p": ["element", "sub"], "c": [
      {"f": "=", "a": [0, 0]},
      {"f": "=", "a": [1, 2]},
    ]},
  },
  {
    "testName": "two changes + prefix + same p + extra element",
    "changes": [{"p": ["sub", "subsub"], "f": "=", "a": [0, 0]}, {"p": ["sub"], "f": "=", "a": [1, 2]}],
    "prefixPath": ["element"],
    "consolidated": {"p": ["element", "sub"], "c": [
      {"p": ["subsub"], "f": "=", "a": [0, 0]},
      {"f": "=", "a": [1, 2]},
    ]},
  },
  {
    "testName": "unnest single child",
    "changes": {"c": [{"f": "=", "a": [0, 0]}]},
    "prefixPath": undefined,
    "consolidated": {"f": "=", "a": [0, 0]},
  },
  {
    "testName": "deep unnest single child",
    "changes": {"c": [{"c": [{"f": "=", "a": [0, 0]}]}]},
    "prefixPath": undefined,
    "consolidated": {"f": "=", "a": [0, 0]},
  },
  {
    "testName": "deep unnest single child of multiple children",
    "changes": {"c": [{"c": [{"f": "=", "a": [0, 0]}]}, {"f": "=", "a": [1, 2]}]},
    "prefixPath": undefined,
    "consolidated": {"c": [{"f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}]},
  },
  {
    "testName": "empty change list",
    "changes": [],
    "prefixPath": undefined,
    "consolidated": {},
  },
];


describe("consolidateChanges tests", () => {
  for (let i = 0; i < consolidateChangesTestCases.length; i++) {
    const test = consolidateChangesTestCases[i];
    it(`consolidateChanges #${i} -- ${test.testName}`, () => {
      const result = consolidateChanges(test.changes, test.prefixPath);
      expect(result).to.deep.equal(test.consolidated);
    });
  }
});


describe("ChangeCollector tests", () => {

  it("ChangeCollector basic", () => {
    const coll = new ChangeCollector();
    expect(coll.hasChange).to.equal(false);
    expect(coll.hasRollbackChange).to.equal(false);
    expect(coll.change).to.deep.equal({});
    expect(coll.rollbackChange).to.deep.equal({});

    coll.addChange("=", 1);
    expect(coll.change).to.deep.equal({"f": "=", "a": [1]});

    coll.addChange("+", 2, 3);
    expect(coll.change).to.deep.equal({"c": [{"f": "=", "a": [1]}, {"f": "+", "a": [2, 3]}]});

    coll.addRollbackChange("+", 2);
    expect(coll.rollbackChange).to.deep.equal({"f": "+", "a": [2]});

    coll.addRollbackChange(".", 3, 4);
    expect(coll.rollbackChange).to.deep.equal({"c": [{"f": ".", "a": [3, 4]}, {"f": "+", "a": [2]}]});
  });

  it("ChangeCollector sub", () => {
    const coll = new ChangeCollector();
    const sub1 = coll.subCollector("item");
    expect(coll.change).to.deep.equal({"p": ["item"]});
    sub1.addChange("=", 1);
    expect(coll.change).to.deep.equal({"p": ["item"], "f": "=", "a": [1]});
    sub1.addChange("+", 2);
    expect(coll.change).to.deep.equal({"p": ["item"], c: [{"f": "=", "a": [1]}, {"f": "+", "a": [2]}]});
    const sub2 = coll.subCollector("item");
    sub2.addChange("+", 5);
    expect(coll.change).to.deep.equal(
      {"p": ["item"], c: [{"f": "=", "a": [1]}, {"f": "+", "a": [2]}, {"f": "+", "a": [5]}]}
    );
    const sub3 = coll.subCollector("sub");
    sub3.addChange("-", 6);
    expect(coll.change).to.deep.equal(
      {"c": [
        {"p": ["item"], c: [{"f": "=", "a": [1]}, {"f": "+", "a": [2]}, {"f": "+", "a": [5]}]},
        {"p": ["sub"], "f": "-", "a": [6]},
      ]},
    );
  });

  it("ChangeCollector sub rollback", () => {
    const coll = new ChangeCollector();
    const sub1 = coll.subCollector("item");
    expect(coll.rollbackChange).to.deep.equal({"p": ["item"]});
    sub1.addRollbackChange("=", 1);
    expect(coll.rollbackChange).to.deep.equal({"p": ["item"], "f": "=", "a": [1]});
    sub1.addRollbackChange("+", 2);
    expect(coll.rollbackChange).to.deep.equal({"p": ["item"], c: [{"f": "+", "a": [2]}, {"f": "=", "a": [1]}]});
    const sub2 = coll.subCollector("item");
    sub2.addRollbackChange("+", 5);
    expect(coll.rollbackChange).to.deep.equal(
      {"p": ["item"], c: [{"f": "+", "a": [5]}, {"f": "+", "a": [2]}, {"f": "=", "a": [1]}]}
    );
    const sub3 = coll.subCollector("sub");
    sub3.addRollbackChange("-", 6);
    expect(coll.rollbackChange).to.deep.equal(
      {"c": [
        {"p": ["sub"], "f": "-", "a": [6]},
        {"p": ["item"], c: [{"f": "+", "a": [5]}, {"f": "+", "a": [2]}, {"f": "=", "a": [1]}]},
      ]},
    );
  });

})


function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
