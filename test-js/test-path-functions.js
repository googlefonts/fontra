import { expect } from "chai";
import fs from "fs";

import {
  insertPoint,
  splitPathAtPointIndices,
} from "../src/fontra/client/core/path-functions.js";
import { PathHitTester } from "../src/fontra/client/core/path-hit-tester.js";
import { enumerate } from "../src/fontra/client/core/utils.js";
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

  const curvedPath = [
    {
      points: [
        { x: 150, y: 250 },
        { x: 400, y: 250, type: "cubic" },
        { x: 50, y: 100, type: "cubic" },
        { x: 300, y: 100 },
      ],
      isClosed: false,
    },
  ];

  const curvedPathQuad = [
    {
      points: [
        { x: 150, y: 250 },
        { x: 400, y: 250, type: "quad" },
        { x: 150, y: 100 },
      ],
      isClosed: false,
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
      {
        path: curvedPath,
        testPoint: undefined,
        testLine: { p1: { x: 200, y: 300 }, p2: { x: 250, y: 50 } },
        expectedPath: [
          {
            points: [
              { x: 150, y: 250 },
              { x: 177, y: 250, type: "cubic" },
              { x: 196, y: 248, type: "cubic" },
              { x: 211, y: 245, smooth: true },
              { x: 264, y: 234, type: "cubic" },
              { x: 245, y: 205, type: "cubic" },
              { x: 225, y: 175, smooth: true },
              { x: 205, y: 145, type: "cubic" },
              { x: 186, y: 116, type: "cubic" },
              { x: 239, y: 105, smooth: true },
              { x: 254, y: 102, type: "cubic" },
              { x: 273, y: 100, type: "cubic" },
              { x: 300, y: 100 },
            ],
            isClosed: false,
          },
        ],
        expectedResult: { numPointsInserted: 9, selectedPointIndices: [3, 6, 9] },
      },
      {
        path: curvedPathQuad,
        testPoint: undefined,
        testLine: { p1: { x: 200, y: 300 }, p2: { x: 250, y: 50 } },
        expectedPath: [
          {
            points: [
              { x: 150, y: 250 },
              { x: 185, y: 250, type: "quad" },
              { x: 211, y: 247, smooth: true },
              { x: 329, y: 233, type: "quad" },
              { x: 229, y: 153, smooth: true },
              { x: 199, y: 130, type: "quad" },
              { x: 150, y: 100 },
            ],
            isClosed: false,
          },
        ],
        expectedResult: { numPointsInserted: 4, selectedPointIndices: [2, 4] },
      },
    ],
    (testCase) => {
      const path = VarPackedPath.fromUnpackedContours(testCase.path);
      const hitTester = new PathHitTester(path);

      let hit;
      if (testCase.testPoint) {
        hit = hitTester.hitTest(testCase.testPoint, 5);
      } else if (testCase.testLine) {
        const intersections = hitTester.lineIntersections(
          testCase.testLine.p1,
          testCase.testLine.p2
        );
        hit = intersections[0];
        hit.ts = [];
        for (const intersection of intersections) {
          hit.ts.push(intersection.t);
        }
      } else {
        throw new Error("Invalid test case");
      }
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
