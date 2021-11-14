import MathArray from "./math-array.js"
import { InterpolationError } from "./errors.js"


export default class MathPath {

  // point types
  static ON_CURVE = 0x00;
  static OFF_CURVE_QUAD = 0x01;
  static OFF_CURVE_CUBIC = 0x02;
  static SMOOTH_FLAG = 0x08;
  static POINT_TYPE_MASK = 0x07;

  constructor(coordinates, pointTypes, contours) {
    if (coordinates === undefined) {
      this.coordinates = new MathArray();
      this.pointTypes = [];
      this.contours = [];
    } else {
      this.coordinates = coordinates;
      this.pointTypes = pointTypes;
      this.contours = contours;
    }
  }

  copy() {
    return new this.constructor(
      this.coordinates.copy(),
      this.pointTypes.slice(),
      this.contours.map(item => { return {...item} }),
    );
  }

  beginPath() {
    if (this.contours.length) {
      this.contours.push({endPoint: this.contours[this.contours.length - 1].endPoint, isClosed: false});
    } else {
      this.contours.push({endPoint: -1, isClosed: false});
    }
  }

  addPoint(x, y, pointType) {
    this.contours[this.contours.length - 1].endPoint += 1;
    this.coordinates.push(x, y);
    this.pointTypes.push(pointType);
  }

  moveTo(x, y) {
    this.beginPath();
    this.addPoint(x, y, MathPath.ON_CURVE);
  }

  lineTo(x, y) {
    this.addPoint(x, y, MathPath.ON_CURVE);
  }

  curveTo(x1, y1, x2, y2, x3, y3) {
    this.addPoint(x1, y1, MathPath.OFF_CURVE_CUBIC);
    this.addPoint(x2, y2, MathPath.OFF_CURVE_CUBIC);
    this.addPoint(x3, y3, MathPath.ON_CURVE);
  }

  qCurveTo( /* var args */ ) {
    const numArgs = arguments.length
    for (let i = 0; i < numArgs - 2; i += 2) {
      this.addPoint(arguments[i], arguments[i + 1], MathPath.OFF_CURVE_QUAD);
    }
    let i = numArgs - 2;
    this.addPoint(arguments[i], arguments[i + 1], MathPath.ON_CURVE);
  }

  closePath() {
    this.contours[this.contours.length - 1].isClosed = true;
  }

  addItemwise(other) {
    let otherCoordinates;
    if (other instanceof MathPath) {
      if (this.pointTypes !== other.pointTypes || this.contours !== other.contours) {
        throw new InterpolationError("paths are not compatible");
      }
      otherCoordinates = other.coordinates;
    } else {
      otherCoordinates = other;
    }
    return new this.constructor(this.coordinates.addItemwise(otherCoordinates), this.pointTypes, this.contours);
  }

  subItemwise(other) {
    let otherCoordinates;
    if (other instanceof MathPath) {
      if (this.pointTypes !== other.pointTypes || this.contours !== other.contours) {
        throw new InterpolationError("paths are not compatible");
      }
      otherCoordinates = other.coordinates;
    } else {
      otherCoordinates = other;
    }
    return new this.constructor(this.coordinates.subItemwise(otherCoordinates), this.pointTypes, this.contours);
  }

  mulScalar(scalar) {
    return new this.constructor(this.coordinates.mulScalar(scalar), this.pointTypes, this.contours);
  }

  drawToPath(path) {
    let startPoint = 0
    for (const contour of this.contours) {
      const endPoint = contour.endPoint;
      const numPoints = contour.endPoint + 1 - startPoint;

      const coordinates = this.coordinates;
      const pointTypes = this.pointTypes;
      var firstOnCurve = null;

      // Determine the index of the first on-curve point, if any
      for (let i = 0; i < numPoints; i++) {
        if ((pointTypes[i] & MathPath.POINT_TYPE_MASK) === MathPath.ON_CURVE) {
          firstOnCurve = i;
          break;
        }
      }

      if (firstOnCurve !== null) {
        drawContourToPath(path, coordinates, pointTypes, startPoint, numPoints, firstOnCurve, contour.isClosed);
      } else {
        // draw quad blob
        // create copy of contour points, and insert implied on-curve at front
        const blobCoordinates = coordinates.slice(startPoint * 2, (endPoint + 1) * 2);
        const blobPointTypes = pointTypes.slice(startPoint, endPoint + 1);
        const xMid = (blobCoordinates[0] + blobCoordinates[endPoint * 2]) / 2;
        const yMid = (blobCoordinates[1] + blobCoordinates[endPoint * 2 + 1]) / 2;
        blobCoordinates.unshift(xMid, yMid);
        blobPointTypes.unshift(MathPath.ON_CURVE);
        drawContourToPath(path, blobCoordinates, blobPointTypes, 0, numPoints + 1, 0, true);
      }

      startPoint = endPoint + 1;
    }
  }
}


function drawContourToPath(path, coordinates, pointTypes, startPoint, numPoints, firstOnCurve, isClosed) {
  let currentSegment = [];
  let segmentFunc = drawLineSegment;
  const lastIndex = isClosed ? numPoints : numPoints - 1 - firstOnCurve;
  for (let i = 0; i <= lastIndex; i++) {
    const index = isClosed ? (startPoint + (firstOnCurve + i) % numPoints) : (startPoint + firstOnCurve + i);
    const pointType = pointTypes[index] & MathPath.POINT_TYPE_MASK;
    const x = coordinates[index * 2];
    const y = coordinates[index * 2 + 1];
    if (i === 0) {
      path.moveTo(x, y);
    } else {
      currentSegment.push(x, y);
      switch (pointType) {
        case MathPath.ON_CURVE:
          segmentFunc(path, currentSegment)
          currentSegment = [];
          segmentFunc = drawLineSegment;
          break;
        case MathPath.OFF_CURVE_QUAD:
          segmentFunc = drawQuadSegment;
          break;
        case MathPath.OFF_CURVE_CUBIC:
          segmentFunc = drawCubicSegment;
          break;
        default:
          throw new Error("illegal point type");
      }
    }
  }
  if (isClosed) {
    path.closePath();
  }
}


function drawLineSegment(path, segment) {
  path.lineTo(...segment);
}


function drawQuadSegment(path, segment) {
  let [x1, y1] = [segment[0], segment[1]]
  const lastIndex = segment.length - 2;
  for (let i = 2; i < lastIndex; i += 2) {
    const [x2, y2] = [segment[i], segment[i + 1]];
    const xMid = (x1 + x2) / 2;
    const yMid = (y1 + y2) / 2;
    path.bezierQuadTo(x1, y1, xMid, yMid);
    [x1, y1] = [x2, y2];
  }
  path.bezierQuadTo(x1, y1, segment[lastIndex], segment[lastIndex + 1]);
}


function drawCubicSegment(path, segment) {
  if (segment.length === 6) {
    path.bezierCurveTo(...segment);
  } else if (segment.length >= 2) {
    // TODO warn or error
    path.lineTo(...segment.slice(-2));
  }
}
