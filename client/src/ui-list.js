const LIST_CHUNK_SIZE = 200;  // the amount of items added to the list at a time


export class List {

  constructor(listID, columnDescriptions) {
    this.container = document.querySelector(`#${listID}`);
    if (!this.container) {
      throw Error(`Expecting an element with id="#${listID}"`);
    }
    if (this.container.children.length != 0) {
      throw Error("list container must be empty");
    }
    this.container.classList.add("ui-list");

    if (!columnDescriptions) {
      columnDescriptions = [
        {
          "key": "default",
          "get": item => item,
        }
      ];
    }
    this.columnDescriptions = columnDescriptions

    this.contents = document.createElement("div");
    this.contents.className = "contents"
    this.container.appendChild(this.contents);
    this.contents.addEventListener("click", event => this._clickHandler(event), false);
    this.container.addEventListener("scroll", event => this._scrollHandler(event), false)
    this.container.addEventListener("keydown", event => this._keyDownHandler(event), false)
    this.selectedItemIndex = undefined;
  }

  setItems(items) {
    this.contents.innerHTML = "";
    this.items = items;
    this._itemsBackLog = Array.from(items);
    this._addMoreItemsIfNeeded();
    this.selectedItemIndex = undefined;
  }

  getSelectedItem() {
    if (this.selectedItemIndex === undefined) {
      return undefined;
    }
    return this.items[this.selectedItemIndex];
  }

  setSelectedItem(item) {
    const index = this.items.indexOf(item);
    if (index >= 0) {
      this._selectByRowElement(this.contents.children[index])
    } else {
      this._selectByRowElement(undefined)
    }
  }

  addEventListener(eventName, handler, options) {
    this.container.addEventListener(eventName, handler, options);
  }

  _addMoreItemsIfNeeded() {
    while (
      this._itemsBackLog.length > 0 &&
      this.container.scrollTop + this.container.offsetHeight + 200 > this.contents.offsetHeight
    ) {
      this._addMoreItems();
    }
  }

  _addMoreItems() {
    const items = this._itemsBackLog.splice(0, LIST_CHUNK_SIZE);
    let rowIndex = this.contents.childElementCount;
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "row";
      row.rowIndex = rowIndex;

      for (const colDesc of this.columnDescriptions) {
        const cell = document.createElement("div");
        cell.className = "text-cell " + colDesc.key;
        const value = colDesc.get ? colDesc.get(item) : item[key];
        cell.append(value);
        row.appendChild(cell);
      }

      this.contents.appendChild(row);
      rowIndex++;
    }
  }

  _clickHandler(event) {
    const target = event.target;
    if (target.parentNode === this.contents) {
      // clicked on row
      this._selectByRowElement(target);
    } else if (target.parentNode.parentNode === this.contents) {
      // clicked on cell
      this._selectByRowElement(target.parentNode);
    }
  }

  _selectByRowElement(row) {
    if (row && row.rowIndex === this.selectedItemIndex) {
      // nothing to do
      return;
    }
    if (this.selectedItemIndex !== undefined) {
      const currentRow = this.contents.children[this.selectedItemIndex];
      currentRow.classList.remove("selected");
    }
    if (row) {
      row.classList.add("selected");
      this.selectedItemIndex = row.rowIndex;
    } else {
      this.selectedItemIndex = undefined;
    }
    const event = new CustomEvent("listSelectionChanged", {
      "bubbles": false,
      "detail": this,
    });
    this.container.dispatchEvent(event);
  }

  _keyDownHandler(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const selectedRow = this.contents.children[this.selectedItemIndex];
    if (selectedRow) {
      let newRow;
      if (event.key === "ArrowUp") {
        newRow = selectedRow.previousElementSibling;
      } else {
        newRow = selectedRow.nextElementSibling;
      }
      if (newRow) {
        newRow.scrollIntoView({behavior: "auto", block: "nearest", inline: "nearest"});
        this._selectByRowElement(newRow);
      }
    }
    event.preventDefault();
  }

  _scrollHandler(event) {
    this._addMoreItemsIfNeeded();
  }

}
