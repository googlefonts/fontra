import { expect } from "chai";
import { FontSourcesInstancer } from "../src/fontra/client/core/font-sources-instancer.js";
import { parametrize } from "./test-support.js";

describe("FontSourcesInstancer Tests", () => {
  const testAxes = [
    { name: "Weight", minValue: 400, defaultValue: 400, maxValue: 900 },
    { name: "Width", minValue: 50, defaultValue: 50, maxValue: 100 },
  ];

  const testSources = {
    source1: {
      name: "Light",
      location: { Weight: 400, Width: 50 },
      verticalMetrics: { ascender: { value: 800 } },
      guidelines: [{ name: "guide", x: 100, y: 200, angle: 0 }],
      customData: {},
    },
    source2: {
      name: "Bold",
      location: { Weight: 900, Width: 50 },
      verticalMetrics: { ascender: { value: 900 } },
      guidelines: [],
      customData: {},
    },
    source3: {
      name: "Light Wide",
      location: { Weight: 400, Width: 100 },
      verticalMetrics: { ascender: { value: 850 } },
      guidelines: [],
      customData: {},
    },
    source4: {
      name: "Bold Wide",
      location: { Weight: 900, Width: 100 },
      verticalMetrics: { ascender: { value: 950 } },
      guidelines: [],
      customData: {},
    },
  };

  const testData = [
    {
      location: {},
      expectedSource: {
        name: "Light",
        location: { Weight: 400, Width: 50 },
        verticalMetrics: { ascender: { value: 800 } },
        guidelines: [{ name: "guide", x: 100, y: 200, angle: 0 }],
        customData: {},
      },
    },
    {
      location: { Weight: 400, Width: 50 },
      expectedSource: {
        name: "Light",
        location: { Weight: 400, Width: 50 },
        verticalMetrics: { ascender: { value: 800 } },
        guidelines: [{ name: "guide", x: 100, y: 200, angle: 0 }],
        customData: {},
      },
    },
    {
      location: { Weight: 900, Width: 50 },
      expectedSource: {
        name: "Bold",
        location: { Weight: 900, Width: 50 },
        verticalMetrics: { ascender: { value: 900 } },
        guidelines: [],
        customData: {},
      },
    },
    {
      location: { Weight: 650 },
      expectedSource: {
        name: null,
        location: null,
        verticalMetrics: { ascender: { value: 850 } },
        guidelines: [],
        customData: {},
      },
    },
    {
      location: { Width: 75 },
      expectedSource: {
        name: null,
        location: null,
        verticalMetrics: { ascender: { value: 825 } },
        guidelines: [],
        customData: {},
      },
    },
    {
      location: { Weight: 650, Width: 75 },
      expectedSource: {
        name: null,
        location: null,
        verticalMetrics: { ascender: { value: 875 } },
        guidelines: [],
        customData: {},
      },
    },
  ];

  parametrize("FontSourcesInstancer.instantiate", testData, (testItem) => {
    const fsi = new FontSourcesInstancer(testAxes, testSources);

    const sourceInstance = fsi.instantiate(testItem.location);
    expect(sourceInstance).to.deep.equal(testItem.expectedSource);
  });

  it("Empty sources list", () => {
    const fsi = new FontSourcesInstancer([], {});
    const sourceInstance = fsi.instantiate({});
    expect(sourceInstance).to.deep.equal(undefined);
  });
});
