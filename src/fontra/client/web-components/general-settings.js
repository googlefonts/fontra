import { html, css, LitElement } from "../third-party/lit.js";
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
    this.themeOptions = {
      options: [
        ["theme-automatic", "automatic", "Automatic (use OS setting)"],
        ["theme-light", "light", "Light theme"],
        ["theme-dark", "dark", "Dark theme"],
      ],
      checked: "automatic", // checked by default
    };

    this.clipboardFormatOptions = {
      options: [
        ["clipboard-format-glif", "glif", "GLIF (RoboFont)"],
        ["clipboard-format-svg", "svg", "SVG"],
        ["clipboard-format-json", "fontra-json", "JSON (Fontra)"],
      ],
      checked: "glif", // checked by default
    };

    this.setupSettings();

    window.addEventListener("fontra-theme-switch", (event) => {
      this.setupSettings();
      this.requestUpdate();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === "fontra-clipboard-format") {
        this.setupSettings();
        this.requestUpdate();
      }
    });
  }

  themeSettings() {
    return html`
      <h2>Theme</h2>
      ${this.themeOptions.options.map((option) => {
        const [optionId, optionValue, optionLabel] = option;
        return html`
          <div id="settings-theme">
            <input
              id="${optionId}"
              value="${optionValue}"
              @click=${(option) => this.themeSwitchCallback(option)}
              name="theme-settings"
              type="radio"
              .checked=${this.themeOptions.checked === optionValue}
            />
            <label for="${optionId}">${optionLabel}</label>
          </div>
        `;
      })}
    `;
  }

  clipboardFormatSettings() {
    return html` <h2>Clipboard Export Format</h2>
      ${this.clipboardFormatOptions.options.map((option) => {
        const [optionId, optionValue, optionLabel] = option;
        return html`
          <div id="settings-clipboard-format">
            <input
              id="${optionId}"
              value="${optionValue}"
              @click=${(option) => this.clipboardFormatSwitchCallback(option)}
              name="clipboard-format-settings"
              type="radio"
              .checked=${this.clipboardFormatOptions.checked === optionValue}
            />
            <label for="${optionId}">${optionLabel}</label>
          </div>
        `;
      })}`;
  }

  render() {
    return html` ${this.themeSettings()} ${this.clipboardFormatSettings()} `;
  }

  setupSettings() {
    const themeValue = localStorage.getItem(THEME_KEY);
    if (themeValue) {
      this.themeOptions.checked = themeValue;
    }

    const clipboardFormatValue = localStorage.getItem("fontra-clipboard-format");
    if (clipboardFormatValue) {
      this.clipboardFormatOptions.checked = clipboardFormatValue;
    }
  }

  themeSwitchCallback(option) {
    const themeValue = option.target.value;
    themeSwitch(themeValue);
    localStorage.setItem(THEME_KEY, themeValue);
    const event = new CustomEvent("fontra-theme-switch", {
      bubbles: false,
    });
    window.dispatchEvent(event);
  }

  clipboardFormatSwitchCallback(option) {
    localStorage.setItem("fontra-clipboard-format", option.target.value);
  }
}

customElements.define("general-settings", GeneralSettings);
