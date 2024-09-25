import { ObservableController } from "./observable-object.js";

export const clipboardFormatController = new ObservableController({ format: "glif" });

clipboardFormatController.synchronizeWithLocalStorage("fontra-clipboard-");
