import { IntoVariableGlyph } from "./var-glyph";

interface FontImageData {
  type: string;
  data: string;
}

interface Metric {
  value: number;
  zone?: number;
}

interface FontSource {
  location: Record<string, number>;
  lineMetricsHorizontalLayout: Record<string, Metric>;
  lineMetricsVerticalLayout: Record<string, Metric>;
}

interface BackendFeatures {
  "background-image": boolean;
}
interface BackendProjectManagerFeatures {
  "export-as": boolean;
}

interface BackendInfo {
  features: BackendFeatures;
  projectManagerFeatures: BackendProjectManagerFeatures;
}

interface RemoteFont {
  /**
   * Register an event handler to deal with events from the backend.
   *
   * Available events are: `close`, `error`, `messageFromServer`, `externalChange`, `reloadData`.
   */
  on(event, callback);
  /**
   * Get the mapping between glyph names and Unicode codepoints.
   */
  getGlyphMap(): Promise<Record<string, number[]>>;
  /**
   * Get the axes of the font
   */
  getAxes(): Promise<Axes>;
  /**
   * Get the background image for a glyph.
   */
  getBackgroundImage(identifier: string): Promise<FontImageData>;
  /**
   * Tell the backend to store an image as the background for a glyph.
   */
  putBackgroundImage(identifier: string, image: FontImageData): Promise<void>;
  getGlyph(identifier: string): Promise<IntoVariableGlyph>;
  getSources(): Promise<Record<string, FontSource>>;
  getUnitsPerEm(): Promise<number>;
  /**
   * Return any custom data that the backend has stored about this font.
   */
  getCustomData(): Promise<any>;
  /**
   * Return information about the backend's capabilities.
   */
  getBackEndInfo(): Promise<BackendInfo>;
  /**
   * Is the font read-only?
   */
  isReadOnly(): Promise<boolean>;
  /**
   * Tell the backend that we are interested in receiving `externalChange` events for this font.
   * @param pathOrPattern
   * @param wantLiveChanges
   */
  subscribeChanges(pathOrPattern: string[], wantLiveChanges: boolean): void;
  /**
   * Tell the backend to stop sending us `externalChange` events for this font.
   * @param pathOrPattern
   * @param wantLiveChanges
   */
  unsubscribeChanges(pathOrPattern: string[], wantLiveChanges: boolean): void;
  /**
   * Notify the backend of a change that is final.
   * @param finalChange
   * @param rollbackChange
   * @param editLabel
   * @param broadcast
   */
  editFinal(
    finalChange: Change,
    rollbackChange: Change,
    editLabel: string,
    broadcast: boolean
  );
  /**
   * Notify the backend of a change that is not yet final.
   * @param change
   */
  editIncremental(change: Change);
  /**
   * Asks the backend to export the font as a file.
   * Options are dependent on the backend's project manager implementation.
   */
  exportAs(options: any);
  /**
   *
   * Which glyphs use glyph `glyphName` as a component. Non-recursive.
   * @param glyphname
   */
  findGlyphsThatUseGlyph(glyphname: string): Promise<string[]>;
}
