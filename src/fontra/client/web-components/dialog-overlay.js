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
      display: none;
      position: absolute;
      grid-template-rows: 5fr 1fr;
      align-items: center;
      z-index: 10000;
      background-color: #8888;
      width: 100%;
      height: 100%;
      align-content: center;
      justify-content: center;
      white-space: normal;
    }

    :host-context(.visible) {
      display: grid;
    }

    .dialog-box {
      position: relative;
      display: grid;
      grid-template-rows: auto 1fr auto;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1em;

      outline: none; /* to catch key events we need to focus, but we don't want a focus border */
      max-width: 32em;
      max-height: 70vh;
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
      hide: () => this.classList.remove("visible"),
      show: () => this.classList.add("visible"),
      then: this._resultPromise.then.bind(this._resultPromise),
    };
  }

  render() {
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

    dialogBox.appendChild(this._renderMessageContent(dialogBox));
    for (const button of this._renderButtons()) {
      dialogBox.appendChild(button);
    }

    if (this._autoDismissTimeout) {
      this._dismissTimeoutID = setTimeout(
        () => dialogDone(null),
        this._autoDismissTimeout
      );
    }

    this.classList.add("visible");
    this.shadowRoot.appendChild(dialogBox);
    dialogBox.focus();
  }

  _renderMessageContent(dialogBox) {
    if (typeof this._messageOrContentFunction === "function") {
      const mainContentElement = this._messageOrContentFunction(dialogBox);
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
    this.classList.remove("visible");
    this._currentActiveElement?.focus();
    this._resolveDialogResult(result);
  }
}

customElements.define("dialog-overlay", DialogOverlay);
