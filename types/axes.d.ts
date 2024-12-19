interface Axis {
  name: string;
  defaultValue: number;
  minValue: number;
  maxValue: number;
}
interface Mapping {
  inputLocation: Record<string, number>;
  outputLocation: Record<string, number>;
}
interface Axes {
  axes: Axis[];
  mappings: Mapping[];
}
