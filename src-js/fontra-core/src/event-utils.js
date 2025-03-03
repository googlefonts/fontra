export function dispatchCustomEvent(element, eventName, detail) {
  const event = new CustomEvent(eventName, {
    bubbles: false,
    detail,
  });
  element.dispatchEvent(event);
}
