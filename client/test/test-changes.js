import chai from "chai";
const expect = chai.expect;
import fs from "fs";

import { applyChange, baseChangeFunctions, consolidateChanges } from "../src/changes.js";


import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)


describe("Changes Tests", () => {

  const test_data_path = join(dirname(dirname(__dirname)), "common/test-data/apply-changes-test-data.json");
  const test_data = JSON.parse(fs.readFileSync(test_data_path, "utf8"));
  const input_data = test_data["input_data"];
  const tests = test_data["tests"];


  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const test_name = test["test_name"];
    const input_data_name = test["input_data_name"];
    const expected = test["expected_data"];

    const subject = copyObject(input_data[input_data_name]);
    it(`Apply Changes test #${i} -- ${test_name}`, () => {
      applyChange(subject, test["change"], baseChangeFunctions);
      expect(subject).to.deep.equal(expected);
    });
  }

});


function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
