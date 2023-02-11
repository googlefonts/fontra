import { Bezier } from "../third-party/bezier.js";
import { centeredRect, sectRect, unionRect } from "./rectangle.js";
import { enumerate } from "./utils.js";

export class PathHitTester {
  constructor(path) {
    const collector = new ContourCollector();
    path.drawToPath2d(collector);
    this.contours = collector.contours.map((segments) => new Contour(segments));
  }

  hitTest(point, margin) {
    const targetRect = centeredRect(point.x, point.y, margin * 2);
    for (const [contourIndex, contour] of enumerate(this.contours)) {
      if (!sectRect(targetRect, contour.bounds)) {
        continue;
      }
      for (const [segmentIndex, segment] of enumerate(contour.segments)) {
        if (!sectRect(targetRect, segment.bounds)) {
          continue;
        }
        const projected = segment.bezier.project(point);
        if (projected.d < margin) {
          return { contourIndex, segmentIndex, ...projected };
        }
      }
    }
    return {};
  }
}

class Contour {
  constructor(segments) {
    this.segments = segments.map((points) => new Segment(points));
    this.bounds = unionRect(...this.segments.map((s) => s.bounds).filter((b) => b));
  }
}

class Segment {
  constructor(points) {
    this.bezier = new Bezier(points);
    this.bounds = polyBounds(points);
  }
}

class ContourCollector {
  constructor() {
    this.contours = [];
  }

  moveTo(x, y) {
    this.currentContour = [];
    this.contours.push(this.currentContour);
    this.currentPoint = { x, y };
    this.firstPoint = this.currentPoint;
  }

  lineTo(x, y) {
    const point = { x, y };
    this.currentContour.push([this.currentPoint, point]);
    this.currentPoint = point;
  }

  bezierCurveTo(x1, y1, x2, y2, x3, y3) {
    const point1 = { x: x1, y: y1 };
    const point2 = { x: x2, y: y2 };
    const point3 = { x: x3, y: y3 };
    this.currentContour.push([this.currentPoint, point1, point2, point3]);
    this.currentPoint = point3;
  }

  quadraticCurveTo(x1, y1, x2, y2) {
    const point1 = { x: x1, y: y1 };
    const point2 = { x: x2, y: y2 };
    this.currentContour.push([this.currentPoint, point1, point2]);
    this.currentPoint = point2;
  }

  closePath() {
    if (
      this.currentPoint.x !== this.firstPoint.x ||
      this.currentPoint.y !== this.firstPoint.y
    ) {
      this.currentContour.push([this.currentPoint, this.firstPoint]);
    }
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
