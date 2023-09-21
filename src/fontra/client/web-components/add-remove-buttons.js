import { LitElement, css, html, unsafeCSS } from "../third-party/lit.js";
import { InlineSVG } from "./inline-svg.js";
import { themeColorCSS } from "./theme-support.js";

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
      display: flex;
      justify-content: center;
      align-items: center;
      width: 1.6rem;
      height: 1.6rem;
      padding: 0;
      margin: 0;
      border-radius: 1rem;
      background-color: var(--button-color);
      fill: var(--text-color);
      border: none;
    }

    button > inline-svg {
      width: 75%;
      height: 75%;
    }

    button:disabled {
      background-color: var(--button-disabled-color);
      fill: var(--text-disabled-color);
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
              <inline-svg src="/images/plus.svg"></inline-svg>
            </button>
            <button
              name="remove-button"
              .disabled=${this.disableRemoveButton}
              @click=${() => this.removeButtonCallback()}
            >
              <inline-svg src="/images/minus.svg"></inline-svg>
            </button>
          </div>
        `;
  }
}

customElements.define("add-remove-buttons", AddRemoveButtons);
