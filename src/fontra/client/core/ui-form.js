export class Form {

  constructor(formID, fieldDescriptions) {
    this.container = document.querySelector(`#${formID}`);
    if (!this.container) {
      throw new Error(`Expecting an element with id="#${formID}"`);
    }
    if (this.container.children.length != 0) {
      throw new Error("Form container must be empty");
    }
    this.container.classList.add("ui-form");
    this.setFieldDescriptions(fieldDescriptions);
  }

  setFieldDescriptions(fieldDescriptions) {
    this.container.innerHTML = "";
    if (!fieldDescriptions) {
      return;
    }
    for (const fieldItem of fieldDescriptions) {
      if (fieldItem.type === "divider") {
        const dividerElement = document.createElement("hr");
        dividerElement.className = "ui-form-divider";
        this.container.appendChild(dividerElement);
        continue;
      }
      const labelElement = document.createElement("div");
      labelElement.classList.add("ui-form-label", fieldItem.type);
      const valueElement = document.createElement("div");
      valueElement.classList.add("ui-form-value", fieldItem.type);

      let label = fieldItem.label || fieldItem.key || "";
      if (label.length && fieldItem.type !== "header") {
        label += ":";
      };
      labelElement.innerHTML = label;
      this.container.appendChild(labelElement);
      if (fieldItem.type === "header") {
        continue;
      }
      this.container.appendChild(valueElement);

      switch (fieldItem.type) {
        case "header":
          valueElement.innerText = fieldItem.value || "";
          break;
        case "text":
          valueElement.innerText = fieldItem.value || "";
          break;
        case "number":
          if (fieldItem.value !== undefined) {
            valueElement.innerText = fieldItem.value;
          }
          break;
        case "edit-number-slider": {
          const inputElement = document.createElement("input");
          const sliderElement = document.createElement("input");
          inputElement.type = "number";
          sliderElement.type = "range";
          for (const el of [inputElement, sliderElement]) {
            el.step = "any";
            el.value = fieldItem.value;
            el.min = fieldItem.minValue;
            el.max = fieldItem.maxValue;
          }
          setSliderCallbacks(
            sliderElement,
            {
              beginDrag: () => {
                // console.log("begin drag");
              },
              change: () => {
                inputElement.value = myRound(sliderElement.value, 3);
              },
              endDrag: () => {
                // console.log("end drag");
              }
            }
          );
          inputElement.onchange = event => {
            sliderElement.value = inputElement.value;
            inputElement.value = sliderElement.value;  // Use slider's clamping
          };
          valueElement.appendChild(inputElement);
          valueElement.appendChild(sliderElement);
          break;
        }
        case "edit-number": {
          const inputElement = document.createElement("input");
          inputElement.type = "number";
          inputElement.value = fieldItem.value;
          inputElement.step = "any";
          valueElement.appendChild(inputElement);
          break;
        }
        case "edit-text": {
          const inputElement = document.createElement("input");
          inputElement.type = "text";
          inputElement.value = fieldItem.value || "";
          valueElement.appendChild(inputElement);
          break;
        }
        default:
          throw new Error(`Unknown field type: ${fieldItem.type}`);
      }
    }
  }

  get values() {

  }

  set values(values) {

  }

}


function myRound(n, digits) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}


function setSliderCallbacks(sliderElement, callbacks) {
  let sliderDragging = false;

  sliderElement.oninput = event => {
    if (!sliderDragging) {
      sliderDragging = true;
      callbacks.beginDrag();
    }
    callbacks.change();
  }

  sliderElement.onchange = event => {
    sliderDragging = false;
    callbacks.endDrag();
  }

}
