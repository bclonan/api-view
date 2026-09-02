import { detectValue, labelFor } from "./detectValue";
import type { SemanticField } from "../types";
import { semanticDescriptor } from "./semantics";
const unsafe = new Set(["__proto__", "prototype", "constructor"]);

export function pathParts(path: string): string[] {
  if (typeof path !== "string" || path.length > 500)
    throw new Error("Field paths must be text up to 500 characters.");
  if (path === "" || path === "$") return [];
  const parts: string[] = [];
  let rest = path.replace(/^\$\.?/, "");
  while (rest) {
    const match = /^(?:\.?([A-Za-z0-9_$-]+)|\[(\d*|"(?:[^"\\]|\\.)*")\])/.exec(
      rest,
    );
    if (!match) throw new Error(`Invalid field path: ${path}`);
    const part =
      match[1] ?? (match[2].startsWith('"') ? JSON.parse(match[2]) : match[2]);
    if (unsafe.has(part)) throw new Error("This field path is reserved.");
    parts.push(part);
    rest = rest.slice(match[0].length);
  }
  if (parts.length > 16)
    throw new Error("Field paths can have up to 16 levels.");
  return parts;
}
export function readPath(value: unknown, path = ""): unknown {
  // A flattened field may already have its complete path as a key.
  if (
    value &&
    typeof value === "object" &&
    Object.hasOwn(value, path) &&
    !unsafe.has(path)
  )
    return (value as Record<string, unknown>)[path];
  const parts = pathParts(path);
  function visit(current: unknown, index: number): unknown {
    if (index === parts.length) return current;
    if (parts[index] === "")
      return Array.isArray(current)
        ? current.slice(0, 5000).map((v) => visit(v, index + 1))
        : undefined;
    if (
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, parts[index])
    )
      return undefined;
    return visit((current as Record<string, unknown>)[parts[index]], index + 1);
  }
  return visit(value, 0);
}
export const appendPath = (parent: string, key: string) =>
  /^[A-Za-z_$][\w$-]*$/.test(key)
    ? `${parent}${parent ? "." : ""}${key}`
    : `${parent}[${JSON.stringify(key)}]`;

export function discoverFields(
  value: unknown,
  collectionRows = true,
): SemanticField[] {
  let remaining = 400;
  function walk(samples: unknown[], parent = "", depth = 0): SemanticField[] {
    if (depth > 10 || remaining <= 0) return [];
    const records = samples.filter(
      (v): v is Record<string, unknown> =>
        !!v && typeof v === "object" && !Array.isArray(v),
    );
    const keys = [...new Set(records.flatMap(Object.keys))]
      .filter((key) => !unsafe.has(key))
      .slice(0, 80);
    return keys.flatMap((key) => {
      if (remaining-- <= 0) return [];
      const values = samples.map((row) =>
        row && typeof row === "object"
          ? (row as Record<string, unknown>)[key]
          : undefined,
      );
      const sample = values.find((v) => v != null);
      const path = appendPath(parent, key);
      const arrays = values.filter(Array.isArray);
      const children = arrays.length
        ? walk(arrays.flat().slice(0, 30), `${path}[]`, depth + 1)
        : walk(
            values.filter((v) => v && typeof v === "object"),
            path,
            depth + 1,
          );
      return [
        {
          key: path,
          path,
          label: labelFor(key),
          ...detectValue({ key, value: sample }),
          ...semanticDescriptor(key, values, parent),
          nullable: values.some((v) => v == null),
          sample:
            typeof sample === "string"
              ? sample.slice(0, 160)
              : sample && typeof sample === "object"
                ? undefined
                : sample,
          ...(children.length ? { children } : {}),
        },
      ];
    });
  }
  if (Array.isArray(value))
    return walk(value.slice(0, 30), collectionRows ? "" : "[]");
  if (value && typeof value === "object") return walk([value]);
  return [
    {
      key: "value",
      path: "$",
      label: "Value",
      ...detectValue({ value }),
      nullable: value == null,
      sample: value,
    },
  ];
}
export function flattenFields(tree: SemanticField[]): SemanticField[] {
  return tree.flatMap((field) =>
    field.children?.length ? flattenFields(field.children) : [field],
  );
}
