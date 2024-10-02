import { ObservableController } from "./observable-object.js";

export const applicationSettingsController = new ObservableController({
  clipboardFormat: "glif",
  scalingEditBehavior: false,
  quadPenTool: false,
  rectSelectLiveModifierKeys: false,
});

applicationSettingsController.synchronizeWithLocalStorage(
  "fontra-application-settings-"
);
