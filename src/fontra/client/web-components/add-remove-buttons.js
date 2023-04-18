import { themeColorCSS } from "./theme-support.js";
import { html, css, LitElement, unsafeCSS } from "../third-party/lit.js";

const colors = {
  "button-color": ["#ddd", "#888"],
  "button-disabled-color": ["#eee", "#555"],
  "button-hover-color": ["#ccc", "#999"],
  "button-active-color": ["#bbb", "#bbb"],
  "text-color": ["#000", "#fff"],
  "text-disabled-color": ["#aaa", "#888"],
};

export class AddRemoveButtons extends LitElement {
  static styles = css`
    ${unsafeCSS(themeColorCSS(colors))}

    .buttons-container {
      padding: 0.5em;
      padding-left: 0;
      display: grid;
      grid-template-columns: auto auto;
      justify-content: start;
      gap: 0.5em;
    }

    button {
      font-size: 1.7em;
      text-align: center;
      line-height: 1.05em;
      width: 1em;
      height: 1em;
      padding: 0;
      border-radius: 1em;
      background-color: var(--button-color);
      color: var(--text-color);
      border: none;
    }

    button:disabled {
      background-color: var(--button-disabled-color);
      color: var(--text-disabled-color);
    }

    button:enabled:hover {
      background-color: var(--button-hover-color);
      cursor: pointer;
    }

    button:enabled:active {
      background-color: var(--button-active-color);
      cursor: pointer;
    }
  `;

  static properties = {
    addButtonCallback: { type: Function },
    removeButtonCallback: { type: Function },
    disableAddButton: { type: Boolean },
    disableRemoveButton: { type: Boolean },
    hidden: { type: Boolean },
  };

  constructor() {
    super();
    this.addButtonCallback = () => {};
    this.removeButtonCallback = () => {};
    this.disableAddButton = false;
    this.disableRemoveButton = false;
    this.hidden = false;
  }

  render() {
    return this.hidden
      ? ""
      : html`
          <div class="buttons-container">
            <button
              name="add-button"
              .disabled=${this.disableAddButton}
              @click=${() => this.addButtonCallback()}
            >
              +
            </button>
            <button
              name="remove-button"
              .disabled=${this.disableRemoveButton}
              @click=${() => this.removeButtonCallback()}
            >
              &minus;
            </button>
          </div>
        `;
  }
}

customElements.define("add-remove-buttons", AddRemoveButtons);
