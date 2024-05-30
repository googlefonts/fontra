import { expect } from "chai";
import { FontSourcesController } from "../src/fontra/client/core/font-sources-controller.js";
import { parametrize } from "./test-support.js";

describe("FontSourcesController Tests", () => {
  const testAxes = [
    { name: "Weight", minValue: 400, defaultValue: 400, maxValue: 900 },
    { name: "Width", minValue: 50, defaultValue: 50, maxValue: 100 },
  ];

  const testSources = {
    source1: {
      location: { Weight: 400, Width: 50 },
      verticalMetrics: { ascender: { value: 800 } },
    },
    source2: {
      location: { Weight: 900, Width: 50 },
      verticalMetrics: { ascender: { value: 900 } },
    },
    source3: {
      location: { Weight: 400, Width: 100 },
      verticalMetrics: { ascender: { value: 850 } },
    },
    source4: {
      location: { Weight: 900, Width: 100 },
      verticalMetrics: { ascender: { value: 950 } },
    },
  };

  const testData = [
    {
      location: {},
      expectedSource: {
        location: { Weight: 400, Width: 50 },
        verticalMetrics: { ascender: { value: 800 } },
      },
    },
    {
      location: { Weight: 400, Width: 50 },
      expectedSource: {
        location: { Weight: 400, Width: 50 },
        verticalMetrics: { ascender: { value: 800 } },
      },
    },
    {
      location: { Weight: 900, Width: 50 },
      expectedSource: {
        location: { Weight: 900, Width: 50 },
        verticalMetrics: { ascender: { value: 900 } },
      },
    },
    {
      location: { Weight: 650 },
      expectedSource: {
        location: null,
        verticalMetrics: { ascender: { value: 850 } },
      },
    },
    {
      location: { Width: 75 },
      expectedSource: {
        location: null,
        verticalMetrics: { ascender: { value: 825 } },
      },
    },
    {
      location: { Weight: 650, Width: 75 },
      expectedSource: {
        location: null,
        verticalMetrics: { ascender: { value: 875 } },
      },
    },
  ];

  parametrize("FontSourcesController.instantiate", testData, (testItem) => {
    const fsc = new FontSourcesController(testAxes, testSources);

    const sourceInstance = fsc.instantiate(testItem.location);
    expect(sourceInstance).to.deep.equal(testItem.expectedSource);
  });
});
