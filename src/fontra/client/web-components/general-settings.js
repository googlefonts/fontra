import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";
import { THEME_KEY, themeSwitch } from "../core/utils.js";
export class GeneralSettings extends LitElement {
  static styles = css`
    h2 {
      font-size: 1em;
    }

    #settings-theme {
      display: grid;
      grid-template-columns: min-content min-content;
    }
  `;

  constructor() {
    super();
    this.settingOptions = [
      ["theme-automatic", "automatic", "Automatic (use OS setting)"],
      ["theme-light", "light", "Light theme"],
      ["theme-dark", "dark", "Dark theme"],
    ];
    this.checked = "automatic"; // checked by default
    this.setupSettings();
  }

  themeSettings() {
    return html`
      <h2>Theme</h2>
      ${this.settingOptions.map((option) => {
        const [optionId, optionValue, optionLabel] = option;
        return html`
          <div id="settings-theme">
            <input
              id="${optionId}"
              value="${optionValue}"
              @click=${(option) => this.themeSwitchCallback(option)}
              name="theme-settings"
              type="radio"
              .checked=${this.checked === optionValue}
            />
            <label for="${optionId}">${optionLabel}</label>
          </div>
        `;
      })}
    `;
  }

  render() {
    return this.themeSettings();
  }

  setupSettings() {
    window.themeSwitchCallback = this.themeSwitchCallback;

    const themeValue = localStorage.getItem("fontra-theme");
    if (themeValue) {
      this.checked = themeValue;
      themeSwitch(themeValue);
    }
  }

  themeSwitchCallback(option) {
    const themeValue = option.target.value;
    themeSwitch(themeValue);
    localStorage.setItem(THEME_KEY, themeValue);
  }
}

customElements.define("general-settings", GeneralSettings);
