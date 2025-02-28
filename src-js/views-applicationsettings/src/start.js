import "/core/theme-settings.js";

import { ApplicationSettingsController } from "/applicationsettings/applicationsettings.js";

async function startApp() {
  window.applicationSettingsController = new ApplicationSettingsController();
  await window.applicationSettingsController.start();
}

startApp();
