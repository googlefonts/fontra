import chai from "chai";
const expect = chai.expect;
import fs from "fs";

import { applyChange, baseChangeFunctions, consolidateChanges } from "../src/fontra/client/core/changes.js";


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
      applyChange(subject, test["change"], baseChangeFunctions);
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
    "testName": "two changes + prefix",
    "changes": [{"f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}],
    "prefixPath": ["element"],
    "consolidated": {"p": ["element"], "c": [{"f": "=", "a": [0, 0]}, {"f": "=", "a": [1, 2]}]},
  },
  {
    "testName": "two changes + prefix + different p",
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
    "consolidated": {"p": ["element"], "c": [
      {"p": ["sub"], "f": "=", "a": [0, 0]},
      {"p": ["sub"], "f": "=", "a": [1, 2]},
    ]},
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


function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
