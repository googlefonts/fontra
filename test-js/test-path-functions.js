import { expect } from "chai";
import fs from "fs";

import {
  insertPoint,
  splitPathAtPointIndices,
} from "../src/fontra/client/core/path-functions.js";
import { PathHitTester } from "../src/fontra/client/core/path-hit-tester.js";
import { VarPackedPath } from "../src/fontra/client/core/var-path.js";

import { parametrize } from "./test-support.js";

describe("Path Functions tests", () => {
  const rectPath = [
    {
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 100, attrs: { test: 123 } },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
      ],
      isClosed: true,
    },
  ];

  parametrize(
    "insertPoint tests",
    [
      {
        path: rectPath,
        testPoint: { x: 50, y: 100 },
        expectedPath: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 0, y: 100, attrs: { test: 123 } },
              { x: 50, y: 100 },
              { x: 100, y: 100 },
              { x: 100, y: 0 },
            ],
            isClosed: true,
          },
        ],
        expectedResult: { numPointsInserted: 1, selectedPointIndices: [2] },
      },
    ],
    (testCase) => {
      const path = VarPackedPath.fromUnpackedContours(testCase.path);

      const hitTester = new PathHitTester(path);
      const hit = hitTester.hitTest(testCase.testPoint, 5);

      const result = insertPoint(path, hit);

      const resultPath = path.unpackedContours();

      expect(resultPath).to.deep.equal(testCase.expectedPath);
      expect(result).to.deep.equal(testCase.expectedResult);
    }
  );

  parametrize(
    "splitPathAtPointIndices tests",
    [
      {
        path: rectPath,
        pointIndices: [1],
        expectedPath: [
          {
            points: [
              { x: 0, y: 100, attrs: { test: 123 } },
              { x: 100, y: 100 },
              { x: 100, y: 0 },
              { x: 0, y: 0 },
              { x: 0, y: 100, attrs: { test: 123 } },
            ],
            isClosed: false,
          },
        ],
        expectedNumSplits: 1,
      },
      {
        path: rectPath,
        pointIndices: [1, 3],
        expectedPath: [
          {
            points: [
              { x: 100, y: 0 },
              { x: 0, y: 0 },
              { x: 0, y: 100, attrs: { test: 123 } },
            ],
            isClosed: false,
          },
          {
            points: [
              { x: 0, y: 100, attrs: { test: 123 } },
              { x: 100, y: 100 },
              { x: 100, y: 0 },
            ],
            isClosed: false,
          },
        ],
        expectedNumSplits: 2,
      },
    ],
    (testCase) => {
      const path = VarPackedPath.fromUnpackedContours(testCase.path);

      const numSplits = splitPathAtPointIndices(path, testCase.pointIndices);

      const unpackedPath = path.unpackedContours();
      const resultPath = path.unpackedContours();

      expect(resultPath).to.deep.equal(testCase.expectedPath);
      expect(numSplits).to.equal(testCase.expectedNumSplits);
    }
  );
});
