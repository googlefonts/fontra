# Fontra Localization Guide

## Concepts

The Fontra implementation for localization is based on a key-value mapping system. The key is a unique string that serves as an identifier in the localization file, while the value is a string intended for display to the user.

- **Source Script:** Located at `src/fontra/client/core/localization.js`.
- **Language Files:** Stored at `src/fontra/client/lang/{locale}.json`, where `{locale}` is the language code (e.g., `en`, `zh-CN`, etc.).

The current locale is setted by Fontra's user settings.

## Examples

### Basic Localization

**English (`en.json`):**

```json
{
  "hello": "Hello, world!"
}
```

**Chinese (`zh-CN.json`):**

```json
{
  "hello": "你好，世界！"
}
```

### JavaScript Localization

To localize in JavaScript:

- Import the `translate` function:

  ```js
  import { translate } from "fontra/client/core/localization.js";
  ```

- Translate the `hello` key:
  ```js
  console.log(translate("hello"));
  ```

### String Interpolation

String interpolation is supported, allowing placeholders (`%{index}` where `index` represents the argument index) for dynamic values. This feature is supported only in JavaScript files.

**Example (`en.json`):**

```json
{
  "hello": "Hello, %0!"
}
```

**Localization Script:**

```js
import { translate } from "fontra/client/core/localization.js";

console.log(translate("hello", "Fontra"));
// Output: "Hello, Fontra!"
```

**Advanced Example (`en.json`):**

```json
{
  "hello": "Hello, %0, %1 and %2!"
}
```

**Handling Arguments:**

- Not enough Arguments:
  ```js
  console.log(translate("hello", "World", "Fontra"));
  // Output: "Hello, World, Fontra and %2!"
  ```
- Too many Arguments:
  ```js
  console.log(translate("hello", "World", "Fontra", "Universe", "Galaxy"));
  // Output: "Hello, World, Fontra and Universe!"
  ```
  No errors are raised for mismatches between the number of placeholders and arguments.

### Pluralization

Basic pluralization is supported, using two different forms: singular and plural. Only one numerical placeholder is allowed per localized string.

**Example (`en.json`):**

```json
{
  "item": "I have %0 item.",
  "item.plural": "I have %0 items."
}
```

**Localization Script:**

```js
import { translatePlural } from "fontra/client/core/localization.js";

console.log(translatePlural("item", 1));
// Output: "I have 1 item."
console.log(translatePlural("item", 10));
// Output: "I have 10 items."
```

If no plural form is defined, the singular form is used instead, useful for languages without pluralization.

**Example (Chinese: `zh-CN.json`):**

```json
{
  "item": "我有 %0 个项目。"
}
```

**Localization Script:**

```js
import { translatePlural } from "fontra/client/core/localization.js";

console.log(translatePlural("item", 1));
// Output: "我有 1 个项目。"
console.log(translatePlural("item", 10));
// Output: "我有 10 个项目。"
```

**Note:**
For multiple numbers within a single string, use multiple keys and concatenating them as a workaround.
