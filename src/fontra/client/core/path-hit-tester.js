import { Bezier } from "../third-party/bezier-js.js";
import { centeredRect, rectSize, sectRect, unionRect } from "./rectangle.js";
import { enumerate, range, reversedEnumerate } from "./utils.js";
import * as vector from "./vector.js";

export class PathHitTester {
  constructor(path, controlBounds) {
    this.path = path;
    this.controlBounds = controlBounds;
    this.contours = [];
    for (const i of range(path.numContours)) {
      this.contours.push({
        bounds: path.getControlBoundsForContour(i),
        isClosed: path.contourInfo[i].isClosed,
      });
    }
  }

  hitTest(point, margin) {
    const targetRect = centeredRect(point.x, point.y, margin * 2);
    for (const [contourIndex, contour] of reversedEnumerate(this.contours)) {
      if (!sectRect(targetRect, contour.bounds)) {
        continue;
      }
      this._ensureContourIsLoaded(contourIndex, contour);
      for (const [segmentIndex, segment] of reversedEnumerate(contour.segments)) {
        if (!sectRect(targetRect, segment.bounds)) {
          continue;
        }
        const projected = segment.bezier.project(point);
        if (projected.d < margin) {
          return { contourIndex, segmentIndex, ...projected, segment };
        }
      }
    }
    return {};
  }

  findNearest(point) {
    this._ensureAllContoursAreLoaded();
    let results = [];
    for (const [contourIndex, contour] of enumerate(this.contours)) {
      for (const [segmentIndex, segment] of enumerate(contour.segments)) {
        const projected = segment.bezier.project(point);
        if (projected) {
          results.push({ contourIndex, segmentIndex, ...projected, segment });
        }
      }
    }
    results = results.filter((hit) => hit.t != 0 && hit.t != 1);
    results.sort((a, b) => a.d - b.d);
    return results[0];
  }

  lineIntersections(point, direction, extraLines) {
    // `point` is the pivot point, and `direction` is the normalized direction vector
    this._ensureAllContoursAreLoaded();

    // From `point` and `direction`, compute two points `p1` and `p2` that are each
    // outside of the path bounding box
    const pointRect = { xMin: point.x, yMin: point.y, xMax: point.x, yMax: point.y };
    const { width, height } = rectSize(unionRect(pointRect, this.controlBounds));
    const maxLength = width + height;
    const p1 = vector.addVectors(point, vector.mulVector(direction, maxLength));
    const p2 = vector.addVectors(point, vector.mulVector(direction, -maxLength));
    const line = { p1, p2 };

    const intersections = [];
    for (const [contourIndex, contour] of enumerate(this.contours)) {
      for (const [segmentIndex, segment] of enumerate(contour.segments)) {
        const info = { contourIndex, segmentIndex, segment };
        intersections.push(
          ...findIntersections(
            segment.bezier,
            line,
            contour.isClosed ? direction : null,
            info
          )
        );
      }
    }

    for (const extraLine of extraLines || []) {
      const lineBezier = new Bezier([extraLine.p1, extraLine.p2]);
      intersections.push(...findIntersections(lineBezier, line, null, {}));
    }

    intersections.sort((a, b) => {
      let d = a.x - b.x;
      if (Math.abs(d) < 0.00000001) {
        d = a.y - b.y;
      }
      return d;
    });
    return intersections;
  }

  _ensureContourIsLoaded(contourIndex, contour) {
    if (contour.segments) {
      return;
    }
    const segments = [...this.path.iterContourDecomposedSegments(contourIndex)];
    segments.forEach((segment) => {
      segment.bezier = new Bezier(segment.points);
      segment.bounds = polyBounds(segment.points);
    });
    contour.segments = segments;
  }

  _ensureAllContoursAreLoaded() {
    if (this.allContoursAreLoaded) {
      return;
    }
    for (const [contourIndex, contour] of enumerate(this.contours)) {
      this._ensureContourIsLoaded(contourIndex, contour);
    }
    this.allContoursAreLoaded = true;
  }
}

function polyBounds(points) {
  if (!points.length) {
    return null;
  }
  let xMin = points[0].x;
  let yMin = points[0].y;
  let xMax = xMin;
  let yMax = yMin;
  for (let i = 1; i < points.length; i++) {
    const x = points[i].x;
    const y = points[i].y;
    xMin = Math.min(x, xMin);
    yMin = Math.min(y, yMin);
    xMax = Math.max(x, xMax);
    yMax = Math.max(y, yMax);
  }
  return { xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax };
}

function lineIntersectsLine(p1, p2, p3, p4) {
  const intersection = vector.intersect(p1, p2, p3, p4);
  if (
    intersection &&
    intersection.t1 >= 0 &&
    intersection.t1 < 1 &&
    intersection.t2 >= 0 &&
    intersection.t2 < 1
  ) {
    return intersection.t1;
  }
}

function findIntersections(bezier, line, direction, info) {
  const interTs = [];
  if (bezier.points.length == 2) {
    // bezier-js's lineIntersects doesn't seem to work for line-line
    // intersections, so we provide our own
    const t = lineIntersectsLine(bezier.points[0], bezier.points[1], line.p1, line.p2);
    if (t !== undefined) {
      interTs.push(t);
    }
  } else {
    const ts = bezier.lineIntersects(line);
    if (ts) {
      interTs.push(...ts);
    }
  }
  return interTs.map((t) => {
    let winding = 0;
    if (direction) {
      const derivative = bezier.derivative(t);
      winding = Math.sign(direction.x * derivative.y - derivative.x * direction.y);
    }
    const point = bezier.compute(t);
    return { ...info, winding, ...point };
  });
}
