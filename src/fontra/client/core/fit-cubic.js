import { enumerate, range } from "./utils.js";
import {
  subVectors,
  vectorLength,
  mulVector,
  addVectors,
  dotVector,
} from "./vector.js";
import { Bezier } from "bezier-js";

function zeros(length, ...rest) {
  if (rest.length === 0) {
    return new Array(length).fill(0);
  } else {
    const result = [];
    for (const _ of range(length)) {
      result.push(zeros(...rest));
    }
    return result;
  }
}

export function generateBezier(points, parameters, leftTangent, rightTangent) {
  const bezierPoints = [points[0], undefined, undefined, points[points.length - 1]];
  const bezierLinear = new Bezier(
    points[0],
    points[0],
    points[points.length - 1],
    points[points.length - 1]
  );
  const A = zeros(parameters.length, 2, 2);
  for (const [i, u] of enumerate(parameters)) {
    const a = (1 - u) ** 2;
    A[i][0] = mulVector(mulVector(mulVector(leftTangent, 3), a), u);
    A[i][1] = mulVector(mulVector(mulVector(rightTangent, 3), 1 - u), u ** 2);
  }
  const C = zeros(2, 2);
  const X = zeros(2);

  for (let i = 0; i < points.length; i++) {
    const u = parameters[i];
    const point = points[i];
    C[0][0] += dotVector(A[i][0], A[i][0]);
    C[0][1] += dotVector(A[i][0], A[i][1]);
    C[1][0] += dotVector(A[i][0], A[i][1]);
    C[1][1] += dotVector(A[i][1], A[i][1]);
    const tmp = subVectors(point, bezierLinear.get(u));
    X[0] += dotVector(A[i][0], tmp);
    X[1] += dotVector(A[i][1], tmp);
  }

  const C0_C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const C0_X = C[0][0] * X[1] - C[1][0] * X[0];
  const X_C1 = X[0] * C[1][1] - X[1] * C[0][1];
  const alphaL = C0_C1 == 0 ? 0 : X_C1 / C0_C1;
  const alphaR = C0_C1 == 0 ? 0 : C0_X / C0_C1;
  const segLength = vectorLength(subVectors(points[0], points[points.length - 1]));
  const epsilonForAll = 1.0e-6 * segLength;
  if (alphaL < epsilonForAll || alphaR < epsilonForAll) {
    bezierPoints[1] = addVectors(
      bezierPoints[0],
      mulVector(leftTangent, segLength / 3.0)
    );
    bezierPoints[2] = addVectors(
      bezierPoints[3],
      mulVector(rightTangent, segLength / 3.0)
    );
  } else {
    bezierPoints[1] = addVectors(bezierPoints[0], mulVector(leftTangent, alphaL));
    bezierPoints[2] = addVectors(bezierPoints[3], mulVector(rightTangent, alphaR));
  }
  return new Bezier(...bezierPoints);
}

function sumVector(point) {
  return point.x + point.y;
}

export function newtonRhapsonRootFind(bezier, point, t) {
  const d = subVectors(bezier.get(t), point);
  const qPrime = bezier.derivative(t);
  const qPrimePrime = bezier.dderivative(t);
  const numerator = sumVector(mulVector(d, qPrime));
  const qPrimeDouble = mulVector(qPrime, qPrime);
  const denominator = sumVector(addVectors(qPrimeDouble, mulVector(qPrimePrime, d)));
  if (denominator === 0) {
    return t;
  } else {
    return t - numerator / denominator;
  }
}

function reparameterize(bezier, points, parameters) {
  return points.map((point, index) =>
    newtonRhapsonRootFind(bezier, point, parameters[index])
  );
}

export function fitCubic(points, leftTangent, rightTangent, error) {
  let parameters = chordLengthParameterize(points);
  let bezier = generateBezier(points, parameters, leftTangent, rightTangent);
  let [maxError, splitPoint] = computeMaxError(points, bezier, parameters);
  if (maxError < error) {
    return bezier;
  }

  if (maxError < error ** 2) {
    for (let i = 0; i < 20; i++) {
      const parametersPrime = reparameterize(bezier, points, parameters);
      bezier = generateBezier(points, parametersPrime, leftTangent, rightTangent);
      [maxError, splitPoint] = computeMaxError(points, bezier, parametersPrime);
      if (maxError < error) {
        break;
      }
      parameters = parametersPrime;
    }
  }

  return bezier;
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

export function computeMaxError(points, bezier, parameters) {
  let maxDistance = 0.0;
  let splitPoint = points.length / 2;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const parameter = parameters[i];
    const pointAtParameter = bezier.get(parameter);
    const distance = vectorLength(subVectors(pointAtParameter, point)) ** 2;
    if (distance > maxDistance) {
      maxDistance = distance;
      splitPoint = i;
    }
  }
  return [maxDistance, splitPoint];
}
