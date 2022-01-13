export function objectsEqual(obj1, obj2) {
  // Shallow object compare. Arguments may be null or undefined
  if (!obj1 || !obj2) {
    return obj1 === obj2;
  }
  const keys = Object.keys(obj1);
  if (keys.length !== Object.keys(obj2).length) {
    return false;
  }
  for (const key of keys) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }
  return true;
}


export function pointInConvexPolygon(x, y, polygon) {
  // Adapted from a comment on
  // https://stackoverflow.com/questions/1119627/how-to-test-if-a-point-is-inside-of-a-convex-polygon-in-2d-integer-coordinates

  // Check if a triangle or higher n-gon
  if (polygon.length < 3) {
    return false;
  }

  // n>2 Keep track of cross product sign changes
  let pos = 0;
  let neg = 0;

  for (let i = 0; i < polygon.length; i++) {
    // If point is in the polygon
    if (polygon[i].x === x && polygon[i].y === y) {
      return true;
    }

    // Form a segment between the i'th point
    const x1 = polygon[i].x;
    const y1 = polygon[i].y;

    // And the i+1'th, or if i is the last, with the first point
    const i2 = (i + 1) % polygon.length;

    const x2 = polygon[i2].x;
    const y2 = polygon[i2].y;

    // Compute the cross product
    const d = (x - x1)*(y2 - y1) - (y - y1)*(x2 - x1);

    if (d > 0) {
      pos++;
    }
    if (d < 0) {
      neg++;
    }

    // If the sign changes, then point is outside
    if (pos > 0 && neg > 0) {
      return false;
    }
  }

  // If no change in direction, then on same side of all segments, and thus inside
  return true;
}


export function convexHull(points) {
  // Adapted from https://en.wikipedia.org/wiki/Graham_scan

  // "The same basic idea works also if the input is sorted on x-coordinate
  // instead of angle, and the hull is computed in two steps producing the
  // upper and the lower parts of the hull respectively."

  points = Array.from(points);
  points.sort((a, b) => ((a.x > b.x) - (a.x < b.x) || (a.y > b.y) - (a.y < b.y)));
  const lower = halfConvexHull(points);
  const upper = halfConvexHull(reversed(points));
  lower.pop();
  upper.pop();
  return upper.concat(lower);
}


function halfConvexHull(points) {
  // Returns half of the convex hull for a set of sorted points.
  // Call with the points reversed for the other half.
  const stack = [];
  for (const point of points) {
    while (stack.length > 1 && ccw(stack[stack.length-2], stack[stack.length-1], point) <= 0) {
      stack.pop();
    }
    stack.push(point);
  }
  return stack;
}


function ccw(p1, p2, p3) {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
}


function *reversed(seq) {
  // Like Python's reversed(seq) builtin
  for (let i = seq.length - 1; i >= 0; i--) {
    yield seq[i];
  }
}
