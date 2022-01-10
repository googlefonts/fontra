export function pointInRect(point, rect) {
  return (
    point.x >= rect.xMin &&
    point.x <= rect.xMax &&
    point.y >= rect.yMin &&
    point.y <= rect.yMax
  );
}


export function centeredRect(x, y, side) {
  const halfSide = side / 2;
  return {
    xMin: x - halfSide,
    yMin: y - halfSide,
    xMax: x + halfSide,
    yMax: y + halfSide
  }
}


export function normalizeRect(rect) {
  const nRect = {
    "xMin": Math.min(rect.xMin, rect.xMax),
    "yMin": Math.min(rect.yMin, rect.yMax),
    "xMax": Math.max(rect.xMin, rect.xMax),
    "yMax": Math.max(rect.yMin, rect.yMax),
  };
  return nRect;
}


export function sectRect(rect1, rect2) {
    // Test for rectangle-rectangle intersection.

    // Args:
    //     rect1: First bounding rectangle
    //     rect2: Second bounding rectangle

    // Returns:
    //     A rectangle or null.
    //     If the input rectangles intersect, returns the intersecting rectangle.
    //     Returns ``null`` if the input rectangles do not intersect.
    const xMin = Math.max(rect1.xMin, rect2.xMin);
    const yMin = Math.max(rect1.yMin, rect2.yMin);
    const xMax = Math.min(rect1.xMax, rect2.xMax);
    const yMax = Math.min(rect1.yMax, rect2.yMax);
    if (xMin >= xMax || yMin >= yMax) {
      return null;
    }
    return {"xMin": xMin, "yMin": yMin, "xMax": xMax, "yMax": yMax};
}


export function unionRect(...rectangles) {
  if (!rectangles.length) {
    return undefined;
  }
  const firstRect = rectangles[0];
  let xMin = firstRect.xMin;
  let yMin = firstRect.yMin;
  let xMax = firstRect.xMax;
  let yMax = firstRect.yMax;
  for (let i = 1; i < rectangles.length; i++) {
    const rect = rectangles[i];
    xMin = Math.min(xMin, rect.xMin);
    yMin = Math.min(yMin, rect.yMin);
    xMax = Math.max(xMax, rect.xMax);
    yMax = Math.max(yMax, rect.yMax);
  }
  return {"xMin": xMin, "yMin": yMin, "xMax": xMax, "yMax": yMax};
}


export function offsetRect(rect, x, y) {
  return {
    "xMin": rect.xMin + x,
    "yMin": rect.yMin + y,
    "xMax": rect.xMax + x,
    "yMax": rect.yMax + y,
  };
}
