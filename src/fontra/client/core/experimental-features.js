import { ObservableController } from "./observable-object.js";

export const experimentalFeaturesController = new ObservableController({
  scalingEditBehavior: false,
  quadPenTool: false,
  rectSelectLiveModifierKeys: false,
});

experimentalFeaturesController.synchronizeWithLocalStorage(
  "fontra-editor-experimental-features."
);
