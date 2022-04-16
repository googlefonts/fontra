export class VariationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VariationError";
  }
};
