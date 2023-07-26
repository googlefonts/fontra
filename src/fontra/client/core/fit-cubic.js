import { enumerate, range } from "./utils.js";
import { subVectors, vectorLength, mulVector, addVectors } from "./vector.js";
import { Bezier } from "bezier-js";

function fitCubic() {}

export function cubicCurve(p1, p2, p3, p4, t) {
  const bezier = new Bezier(p1, p2, p3, p4);
  const { x, y } = bezier.get(t);
  return { x, y };
}

export function chordLengthParameterize(points) {
  const parameters = [0.0];
  for (const i of range(1, points.length)) {
    parameters.push(
      parameters[i - 1] + vectorLength(subVectors(points[i], points[i - 1]))
    );
  }

  for (const [i] of enumerate(parameters)) {
    parameters[i] = parameters[i] / parameters[parameters.length - 1];
  }
  return parameters;
}
