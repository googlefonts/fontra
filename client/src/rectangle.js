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
