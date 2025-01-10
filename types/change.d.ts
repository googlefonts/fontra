type ChangeFunction =
  | "="
  | "d"
  | "-"
  | "+"
  | ":"
  | "=xy"
  | "appendPath"
  | "deleteNTrailingContours"
  | "insertContour"
  | "deleteContour"
  | "deletePoint"
  | "insertPoint";

declare interface Change {
  /**
   * A list of items, eg. ["glyphs", "Aring"]
   */
  p?: string[];
  /**
   * Function name, eg. "appendPath"
   */
  f?: ChangeFunction;
  /**
   * Array of arguments for the change function
   */
  a?: any[];
  /**
   * Array of child changes
   */
  c?: Change[];
}
