import { ObservableController } from "./observable-object.js";
import { fetchJSON } from "./utils.js";

const debugTranslation = false;
let localizationData = {};

export const languageController = new ObservableController({ language: "en" });
languageController.synchronizeWithLocalStorage("fontra-language-");

function languageChanged(locale) {
  fetchJSON(`/lang/${locale}.json`).then((data) => {
    localizationData = data;
  });
}

languageController.addKeyListener("language", (event) => {
  languageChanged(languageController.model.language);
  window.location.reload(true);
});

languageChanged(languageController.model.language || "en");

export function translate(key) {
  if (debugTranslation) {
    return key;
  }

  return localizationData[key] || `!${key}!`;
}

export function localizePage() {
  document.querySelectorAll("[data-tool]").forEach((el) => {
    const key = el.getAttribute("data-tool");
    el.setAttribute("data-tooltip", translate(key));
  });
}
