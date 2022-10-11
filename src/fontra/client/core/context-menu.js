export class ContextMenu {

  constructor(elementID, menuItems) {
    this.element = document.querySelector(`#${elementID}`);

    this.element.innerHTML = "";

    for (const item of menuItems) {
      const el = document.createElement("div");
      if (item === "-") {
        const dividerElement = document.createElement("hr");
        dividerElement.className = "context-menu-item-divider";
        this.element.appendChild(dividerElement);
      } else {
        const itemElement = document.createElement("div");
        itemElement.classList.add("context-menu-item");
        itemElement.classList.toggle("enabled", !item.disabled);
        itemElement.innerText = item.title;
        itemElement.onclick = event => {
          if (item.callback) {
            item.callback(event);
          }
          this.dismiss();
        };
        this.element.appendChild(itemElement);
      }
    }

    const {clientX: mouseX, clientY: mouseY} = event;
    const [normalizedX, normalizedY] = normalizedPosition(mouseX, mouseY);

    this.element.classList.add("visible");
    this.element.style.top = `${normalizedY - 5}px`;
    this.element.style.left = `${normalizedX}px`;
  }

  dismiss() {
    this.element.classList.remove("visible");
  }

}


function normalizedPosition(x, y) {
  // TODO
  return [x, y];
}
