import * as html from "./unlit.js";
import { enumerate } from "./utils.js";

export function dialog(
  headline,
  messageOrContentFunction,
  buttonDefs,
  autoDismissTimeout
) {
  /* return a Promise with the result of the user action, or null for cancel */

  let dismissTimeoutID;
  const dialogDone = (result) => {
    if (dismissTimeoutID) {
      clearTimeout(dismissTimeoutID);
      dismissTimeoutID = undefined;
    }
    container.innerHTML = "";
    container.classList.remove("visible");
    currentActiveElement.focus();
    resolveDialogResult(result);
  };

  let resolveDialogResult;
  const resultPromise = new Promise((resolve) => {
    resolveDialogResult = resolve;
  });

  const currentActiveElement = document.activeElement;

  const container = document.querySelector("#ui-dialog-container");
  const content = html.div({ class: "ui-dialog-content", tabindex: 1 }, [
    html.div({ class: "ui-dialog-headline" }, [headline]),
  ]);
  container.appendChild(content);

  if (typeof messageOrContentFunction === "function") {
    const mainContentElement = messageOrContentFunction(content);
    mainContentElement.classList.add("ui-dialog-message");
    content.appendChild(mainContentElement);
  } else {
    const messageElement = html.div({ class: "ui-dialog-message" }, [
      messageOrContentFunction,
    ]);
    content.appendChild(messageElement);
  }

  let defaultButtonElement, cancelButtonElement;
  buttonDefs = buttonDefs.map((bd) => {
    return { ...bd };
  });
  if (buttonDefs.length === 1) {
    buttonDefs[0].isDefaultButton = true;
  }
  for (const [buttonIndex, buttonDef] of enumerate(buttonDefs, 4 - buttonDefs.length)) {
    const buttonElement = html.input({
      type: "button",
      class: `ui-dialog-button button-${buttonIndex}`,
      value: buttonDef.title,
      onclick: (event) => {
        dialogDone(
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
      defaultButtonElement = buttonElement;
    } else if (buttonDef.isCancelButton) {
      cancelButtonElement = buttonElement;
    }
    content.appendChild(buttonElement);
  }

  content.onkeydown = (event) => {
    if (event.key == "Enter") {
      if (!defaultButtonElement?.classList.contains("disabled")) {
        defaultButtonElement?.click();
      }
    } else if (event.key == "Escape") {
      cancelButtonElement?.click();
      if (!cancelButtonElement) {
        dialogDone(null);
      }
    }
    event.stopImmediatePropagation();
  };

  /* prevent clicks on the dialog itself to propagate to the container */
  content.onclick = (event) => event.stopImmediatePropagation();

  if (autoDismissTimeout) {
    dismissTimeoutID = setTimeout(() => dialogDone(null), autoDismissTimeout);
  }

  container.classList.add("visible");
  content.focus();
  container.onclick = (event) => {
    dialogDone(null);
  };

  return resultPromise;
}
