import { enumerate, range } from "./utils.js";
import { subVectors, vectorLength } from "./vector.js";

function fitCubic() {}

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
