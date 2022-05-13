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

      const methodName = hyphenatedToCamelCase("_add-" + fieldItem.type);
      if (this[methodName] === undefined) {
          throw new Error(`Unknown field type: ${fieldItem.type}`);
      }
      this[methodName](valueElement, fieldItem);
    }
  }

  _addHeader(valueElement, fieldItem) {
    this._addSimple(valueElement, fieldItem);
  }

  _addText(valueElement, fieldItem) {
    this._addSimple(valueElement, fieldItem);
  }

  _addNumber(valueElement, fieldItem) {
    this._addSimple(valueElement, fieldItem);
  }

  _addSimple(valueElement, fieldItem) {
    if (fieldItem.value !== undefined) {
      valueElement.innerText = fieldItem.value;
    }
  }

  _addEditText(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.value = fieldItem.value || "";
    inputElement.disabled = fieldItem.disabled;
    valueElement.appendChild(inputElement);
  }

  _addEditNumber(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    inputElement.type = "number";
    inputElement.value = fieldItem.value;
    inputElement.step = "any";
    inputElement.disabled = fieldItem.disabled;
    valueElement.appendChild(inputElement);
  }

  _addEditNumberSlider(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    const sliderElement = document.createElement("input");
    inputElement.type = "number";
    sliderElement.type = "range";
    for (const el of [inputElement, sliderElement]) {
      el.step = "any";
      el.value = fieldItem.value;
      el.min = fieldItem.minValue;
      el.max = fieldItem.maxValue;
      el.disabled = fieldItem.disabled;
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


function hyphenatedToCamelCase(s) {
  return s.replace(/-([a-z])/g, m => m[1].toUpperCase());
}
