import { UnlitElement } from "/core/unlit.js";
import * as html from "/core/unlit.js";
import { enumerate } from "/core/utils.js";

export function dialog(
  headline,
  messageOrContentFunction,
  buttonDefs,
  autoDismissTimeout
) {
  /* return a Promise with the result of the user action, or null for cancel */
  const dialogOverlayElement = document.querySelector("dialog-overlay");
  return dialogOverlayElement.runDialog(
    headline,
    messageOrContentFunction,
    buttonDefs,
    autoDismissTimeout
  );
}

export class DialogOverlay extends UnlitElement {
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

  runDialog(headline, messageOrContentFunction, buttonDefs, autoDismissTimeout) {
    this._headline = headline;
    this._messageOrContentFunction = messageOrContentFunction;

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

    this.requestUpdate();

    return {
      cancel: () => this._dialogDone(null),
      hide: () => this.hide(),
      show: () => this.show(),
      then: this._resultPromise.then.bind(this._resultPromise),
    };
  }

  async render() {
    if (!this._headline) {
      return;
    }

    const dialogBox = html.div(
      {
        class: "dialog-box",
        tabindex: 1,
        onkeydown: (event) => this._handleKeyDown(event),
        /* prevent clicks on the dialog itself to propagate to the overlay */
        onclick: (event) => event.stopImmediatePropagation(),
      },
      [html.div({ class: "headline" }, [this._headline])]
    );

    dialogBox.appendChild(await this._renderMessageContent(dialogBox));
    for (const button of this._renderButtons()) {
      dialogBox.appendChild(button);
    }

    if (this._autoDismissTimeout) {
      this._dismissTimeoutID = setTimeout(
        () => this._dialogDone(null),
        this._autoDismissTimeout
      );
    }

    this.show();
    this.shadowRoot.appendChild(dialogBox);
    dialogBox.focus();
  }

  async _renderMessageContent(dialogBox) {
    if (typeof this._messageOrContentFunction === "function") {
      const mainContentElement = await this._messageOrContentFunction(dialogBox);
      mainContentElement.classList.add("message");
      return mainContentElement;
    } else {
      const messageElement = html.div({ class: "message" });
      messageElement.innerHTML = this._messageOrContentFunction;
      return messageElement;
    }
  }

  *_renderButtons() {
    this._defaultButtonElement = undefined;
    this._cancelButtonElement = undefined;
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
        this._defaultButtonElement = buttonElement;
      } else if (buttonDef.isCancelButton) {
        this._cancelButtonElement = buttonElement;
      }
      yield buttonElement;
    }
  }

  show() {
    this.style.display = "grid";
  }

  hide() {
    this.style.display = "none";
  }

  _handleKeyDown(event) {
    if (event.key == "Enter") {
      if (!this._defaultButtonElement?.classList.contains("disabled")) {
        this._defaultButtonElement?.click();
      }
    } else if (event.key == "Escape") {
      this._cancelButtonElement?.click();
      if (!this._cancelButtonElement) {
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
    this.innerHTML = "";
    this.hide();
    this._currentActiveElement?.focus();
    this._resolveDialogResult(result);
  }
}

customElements.define("dialog-overlay", DialogOverlay);
