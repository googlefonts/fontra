export class SVGPath2D {

  constructor(scaleFactor = 1, numDigits = 1) {
    const precisionFactor = 10 ** numDigits;
    this.numerator = scaleFactor * precisionFactor;
    this.denominator = precisionFactor;
    this.items = [];
  }

  getPath() {
    return this.items.join("");
  }


  _format(x, y) {
    return formatCoordinate(x, y, this.numerator, this.denominator);
  }

  moveTo(x, y) {
    this.items.push("M" + this._format(x, y));
  }

  lineTo(x, y) {
    this.items.push("L" + this._format(x, y));
  }

  bezierCurveTo(x1, y1, x2, y2, x3, y3) {
    this.items.push(`C${this._format(x1, y1)} ${this._format(x2, y2)} ${this._format(x3, y3)}`);
  }

  quadraticCurveTo(x1, y1, x2, y2) {
    this.items.push(`Q${this._format(x1, y1)} ${this._format(x2, y2)}`);
  }

  closePath() {
    this.items.push("Z");
  }
}


function formatCoordinate(x, y, numerator, denominator) {
  x = Math.round(x * numerator) / denominator;
  y = Math.round(y * numerator) / denominator;
  return `${x},${y}`;
}
