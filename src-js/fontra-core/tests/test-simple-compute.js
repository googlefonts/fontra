import { compute } from "@fontra/core/simple-compute.js";
import { expect } from "chai";
import { parametrize } from "./test-support.js";

describe("simple-compute", () => {
  const computeTestData = [
    { expression: 12, expectedException: "compute `expression` argument not a string" },
    { expression: "", expectedException: "Empty expression given" },
    { expression: "a", variables: {}, expectedException: "Undefined name: 'a'" },
    { expression: "12", expectedResult: 12 },
    { expression: "1.2", expectedResult: 1.2 },
    { expression: "1,2", expectedResult: 1.2 },
    { expression: "1,2+4", expectedResult: 5.2 },
    { expression: "-12", expectedResult: -12 },
    { expression: "0 - -12", expectedResult: 12 },
    { expression: "12*3", expectedResult: 36 },
    { expression: "12 * 3", expectedResult: 36 },
    { expression: "2 * (3 + 1)", expectedResult: 8 },
    { expression: "2 * 3 + 1", expectedResult: 7 },
    { expression: "a", variables: { a: 3 }, expectedResult: 3 },
    { expression: "-a", variables: { a: 3 }, expectedResult: -3 },
    { expression: "aa23", variables: { aa23: 4 }, expectedResult: 4 },
    { expression: "a.alt", variables: { "a.alt": 4 }, expectedResult: 4 },
    { expression: "a-b.2", variables: { "a-b.2": 4 }, expectedResult: 4 },
    { expression: "a-2", variables: { a: 4 }, expectedResult: 2 },
    { expression: "a-b", variables: { "a-b": 4 }, expectedResult: 4 },
    { expression: "a-b", variables: { a: 4, b: 1 }, expectedResult: 3 },
    { expression: "a/2", variables: { a: 3 }, expectedResult: 1.5 },
    { expression: "((a))", variables: { a: 3 }, expectedResult: 3 },
    { expression: "(a)", variables: { a: 3 }, expectedResult: 3 },
    { expression: "(a", variables: { a: 3 }, expectedException: "unknown error" },
    {
      expression: "*",
      variables: { a: 3 },
      expectedException: "Unexpected token: MUL",
    },
    {
      expression: "1 *",
      expectedException: "unknown error",
    },
  ];

  parametrize("compute", computeTestData, (testItem) => {
    if (testItem.expectedException) {
      expect(() =>
        compute(testItem.expression, undefined, testItem.variables)
      ).to.throw(testItem.expectedException);
    } else {
      expect(compute(testItem.expression, undefined, testItem.variables)).to.equal(
        testItem.expectedResult
      );
    }
  });
});
