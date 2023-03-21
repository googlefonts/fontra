import { html, css, LitElement } from "../third-party/lit.js";

export class AddRemoveButtons extends LitElement {
  static styles = css`
    .buttons-container {
      padding: 0.5em;
      padding-left: 0;
    }

    button {
      min-width: 2em;
    }

    button:enabled:hover {
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
