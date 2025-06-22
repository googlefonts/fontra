import { ObservableController } from "./observable-object.js";

export const applicationSettingsController = new ObservableController({
  clipboardFormat: "glif",
  rectSelectLiveModifierKeys: false,
  glyphSourcesSortOptions: "by-axis-value",
});

applicationSettingsController.synchronizeWithLocalStorage(
  "fontra-application-settings-"
);
