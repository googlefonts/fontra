import "/core/theme-settings.js";
import "/web-components/modal-dialog.js";

import { FontOverviewController } from "/fontoverview/fontoverview.js";

async function startApp() {
  window.fontOverviewController = await FontOverviewController.fromBackend();
}

startApp();
