import { fetchJSON } from "./utils.js";

const classSchema = {};

let schemaPromise;

export function getClassSchema(rawSchema) {
  if (!schemaPromise) {
    let resolvePromise;
    schemaPromise = new Promise((resolve) => (resolvePromise = resolve));
    if (rawSchema) {
      populateSchema(rawSchema);
      resolvePromise(classSchema);
    } else {
      fetchJSON("/core/classes.json").then((result) => {
        populateSchema(result);
        resolvePromise(classSchema);
      });
    }
  }
  return schemaPromise;
}

function populateSchema(rawSchema) {
  for (const className in rawSchema) {
    classSchema[className] = new ClassDef(rawSchema[className], className);
  }
}

class ClassDef {
  constructor(rawClassDef, className, subType) {
    this.rawClassDef = rawClassDef;
    this.className = className;
    this.subType = subType;
    this.compositeName = this.subType
      ? `${className}<${this.subType.className}>`
      : className;
    this.subTypeMapping = {};
  }

  getSubType(property) {
    if (this.subType) {
      return this.subType;
    }
    let subType = this.subTypeMapping[property];
    if (!subType) {
      const rawSubDef = this.rawClassDef[property];
      if (!rawSubDef) {
        throw TypeError(`Unknown subType ${property} of ${this.className}`);
      }
      if (rawSubDef.subtype) {
        // type<subType>
        if (!classSchema[rawSubDef.subtype]) {
          classSchema[rawSubDef.subtype] = new ClassDef(null, rawSubDef.subtype);
        }
        subType = new ClassDef(null, rawSubDef.type, classSchema[rawSubDef.subtype]);
      } else {
        if (!classSchema[rawSubDef.type]) {
          classSchema[rawSubDef.type] = new ClassDef(null, rawSubDef.type);
        }
        subType = classSchema[rawSubDef.type];
      }
      this.subTypeMapping[property] = subType;
    }
    return subType;
  }
}
