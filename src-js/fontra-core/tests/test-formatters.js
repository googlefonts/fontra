import {
  ArrayFormatter,
  BooleanFormatter,
  FixedLengthArrayFormatter,
  _NumberFormatter,
} from "@fontra/core/formatters.js";
import { expect } from "chai";

import { getTestData, parametrize } from "./test-support.js";

describe("NumberFormatter", () => {
  parametrize(
    "NumberFormatter tests",
    [
      ["1", 1],
      ["11234", 11234],
      ["0", 0],
      ["-200", -200],
      ["asdfg200", undefined],
      ["", undefined],
      ["test", undefined],
      [undefined, undefined],
      [true, undefined],
      [false, undefined],
      [null, undefined],
      [200, undefined],
      [0, undefined],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(_NumberFormatter.fromString(input).value).to.equal(expectedResult);
    }
  );
});

describe("ArrayFormatter", () => {
  parametrize(
    "ArrayFormatter fromString tests",
    [
      ["1,2,3,4", { value: [1, 2, 3, 4] }],
      ["1, 2,3,4", { value: [1, 2, 3, 4] }],
      ["", { value: [] }],
      ["Hello", { error: "not an array" }],
      [[1, 2, 3, 4], { error: "input value not a string" }],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(ArrayFormatter.fromString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("ArrayFormatter", () => {
  parametrize(
    "ArrayFormatter toString tests",
    [
      [[1, 2, 3, 4], "1,2,3,4"],
      [[], ""],
      [true, { error: "not an array" }],
      [new Set([1, 2, 3]), { error: "not an array" }],
      ["1,2,3,4", { error: "not an array" }],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(ArrayFormatter.toString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("FixedLengthArrayFormatter", () => {
  parametrize(
    "FixedLengthArrayFormatter fromString tests",
    [
      [10, "1,2,3,4,5,6,7,8,9,10", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      [10, "1,2,3,4,5,6,7,8,9", undefined],
      [2, "8,0", [8, 0]],
      [2, [8, 0], undefined],
    ],
    (testData) => {
      const [arrayLength, input, expectedResult] = testData;
      expect(
        FixedLengthArrayFormatter(arrayLength).fromString(input).value
      ).to.deep.equal(expectedResult);
    }
  );
});

describe("FixedLengthArrayFormatter", () => {
  parametrize(
    "FixedLengthArrayFormatter toString tests",
    [
      [10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "1,2,3,4,5,6,7,8,9,10"],
      [10, [1, 2, 3, 4, 5, 6, 7, 8, 9], { error: "array length must be 10" }],
      [2, [8, 0], "8,0"],
      [2, "8,0", { error: "not an array" }],
    ],
    (testData) => {
      const [arrayLength, input, expectedResult] = testData;
      expect(FixedLengthArrayFormatter(arrayLength).toString(input)).to.deep.equal(
        expectedResult
      );
    }
  );
});

describe("BooleanFormatter", () => {
  parametrize(
    "BooleanFormatter fromString tests",
    [
      ["false", false],
      ["true", true],
      ["False", false],
      ["True", true],
      ["FALSE", false],
      ["TRUE", true],
      [false, undefined],
      [true, undefined],
      ["", undefined],
      ["Hello", undefined],
      ["   false    ", false],
      ["   true    ", true],
      [0, undefined],
      [1, undefined],
      ["0", undefined],
      ["1", undefined],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(BooleanFormatter.fromString(input).value).to.deep.equal(expectedResult);
    }
  );
});
