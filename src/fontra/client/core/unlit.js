// This is a tiny subset of a few things that Lit does, except it uses
// object notation to construct dom elements instead of HTML.

export class UnlitElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.requestUpdate();
  }

  requestUpdate() {
    if (this._requestedUpdate) {
      return;
    }
    this._requestedUpdate = true;
    setTimeout(() => this._render(), 0);
  }

  render() {
    //
    // Override, but don't call super().
    //
    // It should return a DOM Element, or an array of DOM Elements,
    // or arrays of arrays of DOM Elements, etc.
    //
    // Use createDomElement() to conveniently construct DOM Elements.
    //
  }

  _render() {
    this._requestedUpdate = false;

    this.shadowRoot.innerHTML = "";
    if (this.constructor.styles) {
      const style = document.createElement("style");
      style.textContent = this.constructor.styles || "";
      this.shadowRoot.appendChild(style);
    }

    let elements = this.render();
    if (!elements) {
      return;
    }

    if (!Array.isArray(elements)) {
      elements = [elements];
    }
    elements = elements.flat();
    for (const element of elements) {
      this.shadowRoot.append(element);
    }
  }
}

const attrExceptions = { for: "htmlFor", class: "className" };

export function createDomElement(tagName, attributes, children) {
  const element = document.createElement(tagName);
  for (const [key, value] of Object.entries(attributes)) {
    element[attrExceptions[key] || key] = value;
  }
  for (const child of children || []) {
    element.append(child);
  }
  return element;
}

// Convenience shortcuts
export const div = createDomElement.bind(null, "div");
export const input = createDomElement.bind(null, "input");
export const label = createDomElement.bind(null, "label");
// Let's add more once needed
