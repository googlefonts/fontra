import "/core/theme-settings.js";
import "/web-components/add-remove-buttons.js";
import "/web-components/designspace-location.js";
import "/web-components/glyph-search-list.js";
import "/web-components/grouped-settings.js";
import "/web-components/inline-svg.js";
import "/web-components/modal-dialog.js";
import "/web-components/ui-list.js";

import { EditorController } from "/editor/editor.js";

async function startApp() {
  window.editorController = await EditorController.fromBackend();
}

startApp();
