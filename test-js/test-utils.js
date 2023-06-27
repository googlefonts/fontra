import chai from "chai";
import {
  objectsEqual,
  capitalizeFirstLetter,
  hyphenatedToCamelCase,
  modulo,
  boolInt,
  reversed,
  enumerate,
  reversedEnumerate,
  range,
  chain,
  makeUPlusStringFromCodePoint,
  getCharFromUnicode,
  guessCharFromGlyphName,
  fileNameExtension,
  arrayExtend,
  clampedNumber,
} from "../src/fontra/client/core/utils.js";
const expect = chai.expect;

describe("objectsEquals", () => {
  it("falsy values", () => {
    expect(objectsEqual(null, null)).equals(true);
    expect(objectsEqual(undefined, null)).equals(false);
    expect(objectsEqual("", "")).equals(true);
    expect(objectsEqual("", null)).equals(false);
  });
  it("with things inside", () => {
    expect(objectsEqual({}, { a: 1 })).equals(false);
    expect(objectsEqual({ a: 1 }, {})).equals(false);
    expect(objectsEqual({ a: 1 }, { a: 2 })).equals(false);
    expect(objectsEqual({ a: 2 }, { a: 2 })).equals(true);
  });
  it("thing in their prototype", () => {
    // making sure only objects own properties checked
    class Thing {
      constructor(value) {
        this.b = value;
      }
    }
    Thing.prototype.a = 1;
    expect(objectsEqual(new Thing(1), { b: 1 })).equals(true);
    expect(objectsEqual(new Thing(1), { b: 1, a: 1 })).equals(false);
  });
});

describe("capitalizeFirstLetter", () => {
  it("basic functionality", () => {
    expect(capitalizeFirstLetter("sam")).equals("Sam");
    expect(capitalizeFirstLetter("Sam")).equals("Sam");
  });
  it("with spaces prefixed", () => {
    expect(capitalizeFirstLetter(" sam")).equals(" sam");
  });
});

describe("hyphenatedToCamelCase", () => {
  it("should camelize", () => {
    expect(hyphenatedToCamelCase("test-case")).equals("testCase");
  });
  it("should not delete the hypen when the second part is not a lowercase letter", () => {
    expect(hyphenatedToCamelCase("test-1")).equals("test-1");
  });
});

describe("modulo", () => {
  it("should return the remaining when divide", () => {
    expect(modulo(12, 5)).equals(2);
  });
  it("python behavior of modulus when mod a minus value", () => {
    expect(modulo(-3, 5)).equals(2);
  });
});

describe("boolInt", () => {
  it("1 for truthy", () => {
    expect(boolInt(true)).equals(1);
    expect(boolInt([])).equals(1);
    expect(boolInt(1)).equals(1);
    expect(boolInt({})).equals(1);
  });
  it("0 for falsy", () => {
    expect(boolInt(false)).equals(0);
    expect(boolInt("")).equals(0);
    expect(boolInt(0)).equals(0);
    expect(boolInt(null)).equals(0);
    expect(boolInt(undefined)).equals(0);
  });
});

describe("reversed", () => {
  it("reverse an iterator", () => {
    const numbers = [1, 2, 3];
    const numbersReversed = [...reversed(numbers)];
    expect(numbersReversed).deep.equals([3, 2, 1]);
  });
});

describe("enumerate", () => {
  it("enumerate an array, enumeration start with 0 by default", () => {
    const numbers = [1, 2, 3];
    const numbersEnumerated = [...enumerate(numbers)];
    expect(numbersEnumerated).deep.equals([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });
  it("enumaration start with a different number than 0", () => {
    const numbers = [1, 2, 3];
    const numbersEnumerated = [...enumerate(numbers, 1)];
    expect(numbersEnumerated).deep.equals([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});

describe("reversedEnumerate", () => {
  it("enumerate and reverse an iterator", () => {
    const numbers = [1, 2, 3];
    const numbersReversed = [...reversedEnumerate(numbers)];
    expect(numbersReversed).deep.equals([
      [2, 3],
      [1, 2],
      [0, 1],
    ]);
  });
});

describe("range", () => {
  it("should generate a range of numbers", () => {
    const numbers = [...range(3)];
    expect(numbers).deep.equals([0, 1, 2]);
  });
  it("should generate a range of numbers, with start and stop values", () => {
    const numbers = [...range(10, 13)];
    expect(numbers, [10, 11, 12]);
  });
  it("should generate a range of numbers, with start, stop and step values", () => {
    const numbers = [...range(10, 15, 2)];
    expect(numbers, [10, 12, 14]);
  });
});

describe("chain", () => {
  it("chain iterators", () => {
    const chained = [...chain(range(2), range(2))];
    expect(chained, [0, 1, 0, 1]);
  });
});

describe("makeUPlusStringFromCodePoint", () => {
  it("throws an exception when an invalid parameter is given", () => {
    expect(() => makeUPlusStringFromCodePoint("not-a-number")).to.throw();
  });
  it("should not throw an exception for a falsy value", () => {
    expect(() => makeUPlusStringFromCodePoint("")).to.not.throw();
  });
  it("make a number unicode hex", () => {
    expect(makeUPlusStringFromCodePoint(97)).equals("U+0061"); // a
    expect(makeUPlusStringFromCodePoint(65)).equals("U+0041"); // A
  });
});

describe("getCharFromUnicode", () => {
  it("should return an empty string if an argument is not passed", () => {
    expect(getCharFromUnicode()).equals("");
  });
  it("should convert a unicode symbol number to a character", () => {
    expect(getCharFromUnicode(97)).equals("a");
  });
});

describe("guessCharFromGlyphName", () => {
  it("should guess a character from code points in free text", () => {
    expect(guessCharFromGlyphName("text 0061 text")).equals("a");
    expect(guessCharFromGlyphName("text ff0061 text")).equals("a");
    expect(guessCharFromGlyphName("text ff0041 text")).equals("A");
    expect(guessCharFromGlyphName("text 110000 text")).equals("");
    expect(guessCharFromGlyphName("text 10FFFF text")).equals("");
    expect(guessCharFromGlyphName("text 100000 text")).equals("");
    expect(guessCharFromGlyphName("text 1F440 text")).equals("👀");
  });
});

describe("fileNameExtension", () => {
  it("should return the file extension of a file name", () => {
    expect(fileNameExtension("test-utils.js")).equals("js");
  });
  it("should work well when there is a dot in the file name", () => {
    expect(fileNameExtension("test.utils.js")).equals("js");
  });
  it("should return the given file name when there is no extension", () => {
    expect(fileNameExtension("utils")).equals("utils");
  });
});

describe("arrayExtend", () => {
  it("should extend arrays with another one", () => {
    const array = [1, 2, 3];
    arrayExtend(array, [4, 5]);
    expect(array).deep.equals([1, 2, 3, 4, 5]);
  });
  it("test chunk-by-chunk addition by 1024", () => {
    const destinationArray = [1, 2, 3];
    arrayExtend(destinationArray, [...range(1025)]);
    expect(destinationArray).deep.equals([1, 2, 3, ...range(1025)]);
  });
});

describe("clampedNumber", () => {
  it("should give the minimum when the number is below the range", () => {
    expect(clampedNumber(10, 50, 80)).equals(50);
  })
  it("should give the minimum when the number is exceeds the range", () => {
    expect(clampedNumber(81, 50, 80)).equals(80);
  })
})
