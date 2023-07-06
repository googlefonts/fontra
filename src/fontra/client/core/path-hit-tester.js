import { Bezier } from "../third-party/bezier-js.js";
import { centeredRect, sectRect } from "./rectangle.js";
import { enumerate, range, reversedEnumerate } from "./utils.js";
import * as vector from "./vector.js";

export class PathHitTester {
  constructor(path) {
    this.path = path;
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

  lineIntersections(line) {
    this._ensureAllContoursAreLoaded();
    const lineDirection = vector.subVectors(line.p2, line.p1);
    const intersections = [];
    for (const [contourIndex, contour] of enumerate(this.contours)) {
      for (const [segmentIndex, segment] of enumerate(contour.segments)) {
        const interTs = [];
        if (segment.bezier.points.length == 2) {
          const t = lineIntersectsLine(
            segment.bezier.points[0],
            segment.bezier.points[1],
            line.p1,
            line.p2
          );
          if (t !== undefined) {
            interTs.push(t);
          }
        } else {
          const ts = segment.bezier.lineIntersects(line);
          if (ts) {
            interTs.push(...ts);
          }
        }
        if (interTs.length) {
          intersections.push(
            ...interTs.map((t) => {
              let winding = 0;
              if (contour.isClosed) {
                const derivative = segment.bezier.derivative(t);
                winding = Math.sign(
                  lineDirection.x * derivative.y - derivative.x * lineDirection.y
                );
              }
              const point = segment.bezier.compute(t);
              return { contourIndex, segmentIndex, segment, winding, ...point };
            })
          );
        }
      }
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
