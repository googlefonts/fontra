import { SimpleElement } from "/core/unlit.js";
import * as html from "/core/unlit.js";
import { enumerate } from "/core/utils.js";

export async function dialog(headline, message, buttonDefs, autoDismissTimeout) {
  const dialogOverlayElement = await dialogSetup(
    headline,
    message,
    buttonDefs,
    autoDismissTimeout
  );
  return await dialogOverlayElement.run();
}

export async function dialogSetup(headline, message, buttonDefs, autoDismissTimeout) {
  const dialogOverlayElement = document.querySelector("dialog-overlay");
  await dialogOverlayElement.setupDialog(
    headline,
    message,
    buttonDefs,
    autoDismissTimeout
  );
  return dialogOverlayElement;
}

export class DialogOverlay extends SimpleElement {
  static styles = `
    :host {
      display: none;  /* switched to "grid" on show, back to "none" on hide */
      position: absolute;
      grid-template-rows: 15fr 1fr;
      align-items: center;
      z-index: 10000;
      background-color: #8888;
      width: 100%;
      height: 100%;
      align-content: center;
      justify-content: center;
      white-space: normal;
    }

    .dialog-box {
      position: relative;
      display: grid;
      grid-template-rows: auto 1fr auto;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1em;

      outline: none; /* to catch key events we need to focus, but we don't want a focus border */
      max-width: 32em;
      max-height: 80vh;
      overflow-wrap: normal;
      font-size: 1.15em;
      background-color: var(--ui-element-background-color);
      padding: 1em;
      border-radius: 0.5em;
      box-shadow: 1px 3px 8px #0006;
    }

    .headline {
      font-weight: bold;
      grid-column: 1 / -1;
    }

    .message {
      grid-column: 1 / -1;
    }

    .button {
      color: white;
      background-color: gray;

      border-radius: 1em;
      padding: 0.35em 2em 0.35em 2em;

      border: none;
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1em;
      text-align: center;
      transition: 100ms;
    }

    .button.button-1 {
      grid-column: 1;
    }

    .button.button-2 {
      grid-column: 2;
    }

    .button.button-3 {
      grid-column: 3;
    }

    .button.default {
      background-color: var(--fontra-red-color);
    }

    .button.disabled {
      background-color: #8885;
      pointer-events: none;
    }

    .button:hover {
      filter: brightness(1.15);
    }

    .button:active {
      filter: brightness(0.9);
    }

    input[type="text"] {
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      border-radius: 0.25em;
      border: none;
      outline: none;
      padding: 0.2em 0.5em;
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1.1rem;
      resize: none;
    }
  `;

  constructor() {
    super();
    this.dialogBox = html.div({
      class: "dialog-box",
      tabindex: 1,
      onkeydown: (event) => this._handleKeyDown(event),
      /* prevent clicks on the dialog itself to propagate to the overlay */
      onclick: (event) => event.stopImmediatePropagation(),
    });
    this.shadowRoot.appendChild(this.dialogBox);
  }

  setupDialog(headline, message, buttonDefs, autoDismissTimeout) {
    buttonDefs = buttonDefs.map((bd) => {
      return { ...bd };
    });
    if (buttonDefs.length === 1) {
      buttonDefs[0].isDefaultButton = true;
    }
    for (const buttonDef of buttonDefs) {
      if (buttonDef.isCancelButton && buttonDef.resultValue === undefined) {
        buttonDef.resultValue = null;
      }
    }
    this._buttonDefs = buttonDefs;

    this._autoDismissTimeout = autoDismissTimeout;

    this._resultPromise = new Promise((resolve) => {
      this._resolveDialogResult = resolve;
    });
    this._currentActiveElement = document.activeElement;

    this.onclick = (event) => {
      this._dialogDone(null);
    };

    this._populateDialogBox(headline, message);
  }

  run() {
    this.show();
    return this._resultPromise;
  }

  async _populateDialogBox(headline, message) {
    this.dialogBox.innerHTML = "";
    this.dialogBox.appendChild(html.div({ class: "headline" }, [headline]));

    this.dialogContent = html.div({ class: "message" }, [message]);
    this.dialogBox.appendChild(this.dialogContent);

    for (const button of this._renderButtons()) {
      this.dialogBox.appendChild(button);
    }

    if (this._autoDismissTimeout) {
      this._dismissTimeoutID = setTimeout(
        () => this._dialogDone(null),
        this._autoDismissTimeout
      );
    }
  }

  setContent(contentElement) {
    contentElement.classList.add("message");
    this.dialogContent.replaceWith(contentElement);
    this.dialogContent = contentElement;
  }

  *_renderButtons() {
    this.defaultButton = undefined;
    this.cancelButton = undefined;
    for (const [buttonIndex, buttonDef] of enumerate(
      this._buttonDefs,
      4 - this._buttonDefs.length
    )) {
      const buttonElement = html.input({
        type: "button",
        class: `button button-${buttonIndex}`,
        value: buttonDef.title,
        onclick: (event) => {
          this._dialogDone(
            buttonDef.getResult
              ? buttonDef.getResult()
              : buttonDef.resultValue !== undefined
              ? buttonDef.resultValue
              : buttonDef.title
          );
        },
      });
      if (buttonDef.disabled) {
        buttonElement.classList.add("disabled");
      }
      if (buttonDef.isDefaultButton) {
        buttonElement.classList.add("default");
        this.defaultButton = buttonElement;
      } else if (buttonDef.isCancelButton) {
        this.cancelButton = buttonElement;
      }
      yield buttonElement;
    }
  }

  cancel() {
    this._dialogDone(null);
  }

  show() {
    this.style.display = "grid";
    this.dialogBox.focus();
  }

  hide() {
    this.style.display = "none";
  }

  _handleKeyDown(event) {
    if (event.key == "Enter") {
      if (!this.defaultButton?.classList.contains("disabled")) {
        this.defaultButton?.click();
      }
    } else if (event.key == "Escape") {
      this.cancelButton?.click();
      if (!this.cancelButton) {
        this._dialogDone(null);
      }
    }
    event.stopImmediatePropagation();
  }

  _dialogDone(result) {
    if (this._dismissTimeoutID) {
      clearTimeout(this._dismissTimeoutID);
      this._dismissTimeoutID = undefined;
    }
    this.dialogBox.innerHTML = "";
    delete this.dialogContent;

    this.hide();
    this._currentActiveElement?.focus();
    this._resolveDialogResult(result);
  }
}

customElements.define("dialog-overlay", DialogOverlay);
