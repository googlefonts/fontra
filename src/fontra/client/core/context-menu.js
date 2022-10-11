export class ContextMenu {

  constructor(elementID, menuItems) {
    this.element = document.querySelector(`#${elementID}`);

    this.element.innerHTML = "";
    this.element.oncontextmenu = event => event.preventDefault();  // No context menu on our context menu please

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

    this.element.classList.add("visible");

    const container = document.querySelector("body");
    const {clientX: mouseX, clientY: mouseY} = event;
    const [normalizedX, normalizedY] = normalizedPosition(container, this.element, mouseX, mouseY);

    this.element.style.top = `${normalizedY - 5}px`;
    this.element.style.left = `${normalizedX}px`;
  }

  dismiss() {
    this.element.classList.remove("visible");
  }

}


function normalizedPosition(container, contextMenu, mouseX, mouseY) {
  const {
    left: containerOffsetX,
    top: containerOffsetY,
  } = container.getBoundingClientRect();

  const containerX = mouseX - containerOffsetX;
  const containerY = mouseY - containerOffsetY;

  const outOfBoundsOnX = containerX + contextMenu.clientWidth > container.clientWidth;

  const outOfBoundsOnY = containerY + contextMenu.clientHeight > container.clientHeight;

  let normalizedX = mouseX;
  let normalizedY = mouseY;

  if (outOfBoundsOnX) {
    normalizedX = containerOffsetX + container.clientWidth - contextMenu.clientWidth;
  }

  if (outOfBoundsOnY) {
    normalizedY = containerOffsetY + container.clientHeight - contextMenu.clientHeight;
  }

  return [normalizedX, normalizedY];
}
