import "/core/theme-settings.js";

import { EditorController } from "/editor/editor.js";

async function startApp() {
  window.editorController = await EditorController.fromBackend();
}

startApp();
