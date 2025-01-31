import "/core/theme-settings.js";

import { FontInfoController } from "/fontinfo/fontinfo.js";

async function startApp() {
  window.fontInfoController = await FontInfoController.fromBackend();
}

startApp();
