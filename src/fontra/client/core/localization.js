import { fetchJSON } from "./utils.js";

const debugTranslation = false;
const availableLanguages = ["en", "zh-CN"];

var locale = "en"; // Default to English
const currentlanguage = navigator.language;
if (availableLanguages.includes(currentlanguage)) {
  locale = currentlanguage;
}

var localizationData = {};
fetchJSON(`/lang/${locale}.json`).then((data) => {
  localizationData = data;
});

export function translate(key) {
  if (debugTranslation) {
    return key;
  }

  return localizationData[key] || `!${key}!`;
}
