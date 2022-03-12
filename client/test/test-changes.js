import chai from "chai";
const expect = chai.expect;
import fs from "fs";

import { applyChange, baseChangeFunctions, consolidateChanges } from "../src/changes.js";


import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)


describe("Changes Tests", () => {

  const test_data_path = join(dirname(dirname(__dirname)), "common/test-data/apply-change-test-data.json");
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


function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
