import { reversed } from "./utils.js";
import { roundVector } from "./vector.js";

export function insertPoint(path, intersection) {
  let selectedPointIndex;
  const segment = intersection.segment;
  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(
    segment.parentPointIndices[0]
  );
  const absToRel = contourPointIndex - segment.parentPointIndices[0];
  let insertIndex = segment.pointIndices.at(-1) + absToRel;
  if (!insertIndex) {
    insertIndex = path.getNumPointsOfContour(contourIndex);
  }
  if (segment.points.length === 2) {
    // insert point in line
    path.insertPoint(contourIndex, insertIndex, {
      x: intersection.x,
      y: intersection.y,
    });
    selectedPointIndex = insertIndex;
  } else {
    // insert point in curve
    let deleteIndices;
    const firstOffCurve = path.getPoint(segment.parentPointIndices[1]);
    if (firstOffCurve.type === "cubic") {
      const { left, right } = segment.bezier.split(intersection.t);
      const points = [...left.points.slice(1), ...right.points.slice(1, 3)].map(
        roundVector
      );
      points[0].type = "cubic";
      points[1].type = "cubic";
      points[2].smooth = true;
      points[3].type = "cubic";
      points[4].type = "cubic";
      for (const point of reversed(points)) {
        path.insertPoint(contourIndex, insertIndex, point);
      }
      // selectionBias is non-zero if the cubic segment has more than
      // two off-curve points, which is currently invalid. We delete all
      // off-curve, and replace with clean cubic segments, but this messes
      // with the selection index
      const selectionBias = segment.parentPointIndices.length - 4;
      deleteIndices = segment.parentPointIndices.slice(1, -1);
      console.log("insertIndex", insertIndex);
      console.log("deleteIndices", deleteIndices);
      selectedPointIndex = insertIndex - selectionBias;
    } else {
      // quad
      deleteIndices = [];
      // const point1 = path.getPoint(segment.pointIndices[0]);
      // const point2 = path.getPoint(segment.pointIndices[1]);
      // const point3 = path.getPoint(segment.pointIndices[2]);
      // if (point1.type) {
      //   console.log("insert implied 1");
      // }
      // if (point3.type) {
      //   console.log("insert implied 2");
      // }
    }
    deleteIndices.sort((a, b) => b - a); // reverse sort
    deleteIndices.forEach((pointIndex) =>
      path.deletePoint(contourIndex, pointIndex + absToRel)
    );
  }
  const selection = new Set();
  if (selectedPointIndex !== undefined) {
    selectedPointIndex = path.getAbsolutePointIndex(contourIndex, selectedPointIndex);
    selection.add(`point/${selectedPointIndex}`);
  }
  return selection;
}

export function splitPathAtPointIndices(path, pointIndices) {
  let numSplits = 0;
  const selectionByContour = new Map();
  for (const pointIndex of pointIndices) {
    const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
    if (!selectionByContour.has(contourIndex)) {
      selectionByContour.set(contourIndex, []);
    }
    selectionByContour.get(contourIndex).push(contourPointIndex);
  }
  const selectedContours = [...selectionByContour.keys()];
  // Reverse-sort the contour indices, so we can replace contours
  // with multiple split contours without invalidating the prior
  // contour indices
  selectedContours.sort((a, b) => b - a);

  for (const contourIndex of selectedContours) {
    const contour = path.getUnpackedContour(contourIndex);
    const isClosed = path.contourInfo[contourIndex].isClosed;
    const points = contour.points;
    // Filter out off-curve points, as well as start and end points of open paths
    const contourPointIndices = selectionByContour
      .get(contourIndex)
      .filter((i) => !points[i].type && (isClosed || (i > 0 && i < points.length - 1)));
    if (!contourPointIndices.length) {
      continue;
    }
    numSplits += contourPointIndices.length;

    const pointArrays = [points];
    let pointIndexBias = 0;
    if (isClosed) {
      const splitPointIndex = contourPointIndices.pop();
      pointArrays[0] = splitClosedPointsArray(points, splitPointIndex);
      pointIndexBias = points.length - splitPointIndex;
    }

    for (const splitPointIndex of reversed(contourPointIndices)) {
      const points = pointArrays.pop();
      const [points1, points2] = splitOpenPointsArray(
        points,
        splitPointIndex + pointIndexBias
      );
      pointArrays.push(points2);
      pointArrays.push(points1);
    }

    path.deleteContour(contourIndex);
    // Insert the split contours in reverse order
    for (const points of pointArrays) {
      // Ensure the end points are not smooth
      delete points[0].smooth;
      delete points[points.length - 1].smooth;
      path.insertUnpackedContour(contourIndex, { points: points, isClosed: false });
    }
  }
  return numSplits;
}

function splitClosedPointsArray(points, splitPointIndex) {
  return points.slice(splitPointIndex).concat(points.slice(0, splitPointIndex + 1));
}

function splitOpenPointsArray(points, splitPointIndex) {
  if (!splitPointIndex || splitPointIndex >= points.length - 1) {
    throw new Error(`assert -- invalid point index ${splitPointIndex}`);
  }
  return [points.slice(0, splitPointIndex + 1), points.slice(splitPointIndex)];
}

export function connectContours(path, sourcePointIndex, targetPointIndex) {
  let selectedPointIndex;
  const [sourceContourIndex, sourceContourPointIndex] =
    path.getContourAndPointIndex(sourcePointIndex);
  const [targetContourIndex, targetContourPointIndex] =
    path.getContourAndPointIndex(targetPointIndex);
  if (sourceContourIndex == targetContourIndex) {
    // Close contour
    path.contourInfo[sourceContourIndex].isClosed = true;
    if (sourceContourPointIndex) {
      path.deletePoint(sourceContourIndex, sourceContourPointIndex);
    } else {
      // Ensure the target point becomes the start point
      path.setPoint(sourcePointIndex, path.getPoint(targetPointIndex));
      path.deletePoint(sourceContourIndex, targetContourPointIndex);
    }
    selectedPointIndex = sourceContourPointIndex ? targetPointIndex : sourcePointIndex;
  } else {
    // Connect contours
    const sourceContour = path.getUnpackedContour(sourceContourIndex);
    const targetContour = path.getUnpackedContour(targetContourIndex);
    if (!!sourceContourPointIndex == !!targetContourPointIndex) {
      targetContour.points.reverse();
    }
    sourceContour.points.splice(
      sourceContourPointIndex ? -1 : 0,
      1,
      ...targetContour.points
    );
    path.deleteContour(sourceContourIndex);
    path.insertUnpackedContour(sourceContourIndex, sourceContour);
    path.deleteContour(targetContourIndex);

    selectedPointIndex = path.getAbsolutePointIndex(
      targetContourIndex < sourceContourIndex
        ? sourceContourIndex - 1
        : sourceContourIndex,
      sourceContourPointIndex
        ? sourceContourPointIndex
        : targetContour.points.length - 1
    );
  }
  return new Set([`point/${selectedPointIndex}`]);
}
