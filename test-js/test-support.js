import chai from "chai";

export function parametrize(testName, testItems, func) {
  for (let i = 0; i < testItems.length; i++) {
    const testItem = testItems[i];
    it(`${testName} ${i}`, () => {
      func(testItem);
    });
  }
}
