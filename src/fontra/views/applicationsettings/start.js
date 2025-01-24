import "/core/theme-settings.js";
import "/web-components/grouped-settings.js";
import "/web-components/modal-dialog.js";
import "/web-components/plugin-manager.js";

import { ApplicationSettingsController } from "/applicationsettings/applicationsettings.js";

async function startApp() {
  window.applicationSettingsController = new ApplicationSettingsController();
  await window.applicationSettingsController.start();
}

startApp();
