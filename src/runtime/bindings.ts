import Ajv from "ajv";
import { pathParts, readPath } from "./fields";
import { isRow, normalizeData, rowsOf } from "./normalize";
import { detectValue } from "./detectValue";
import type {
  DataBinding,
  DataTransform,
  Row,
  Widget,
  SemanticValueType,
} from "../types";
const field = { type: "string", maxLength: 500 };
const name = { type: "string", minLength: 1, maxLength: 120 };
const scalar = {
  type: ["string", "number", "boolean", "null"],
  maxLength: 1000,
};
export const bindingsSchema = {
  type: "object",
  maxProperties: 30,
  propertyNames: {
    pattern: "^(\\$data|[A-Za-z][A-Za-z0-9_-]{0,59})$",
    not: { enum: ["constructor", "prototype", "__proto__"] },
  },
  additionalProperties: {
    type: "object",
    additionalProperties: false,
    properties: {
      sourceId: name,
      path: field,
      origin: { enum: ["raw", "data"] },
      literal: scalar,
      label: name,
    },
    oneOf: [
      { required: ["path"], not: { required: ["literal"] } },
      {
        required: ["literal"],
        not: { anyOf: [{ required: ["path"] }, { required: ["sourceId"] }] },
      },
    ],
  },
};
export const transformsSchema = {
  type: "array",
  maxItems: 20,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["op"],
    properties: {
      op: {
        enum: [
          "select",
          "rename",
          "filter",
          "sort",
          "limit",
          "map",
          "derive",
          "aggregate",
          "group",
          "flatten",
          "merge",
          "join",
        ],
      },
      field,
      fields: { type: "array", items: field, minItems: 1, maxItems: 40 },
      as: name,
      value: scalar,
      comparison: { enum: ["eq", "ne", "gt", "gte", "lt", "lte", "contains"] },
      direction: { enum: ["asc", "desc"] },
      count: { type: "integer", minimum: 1, maximum: 5000 },
      mapping: {
        type: "object",
        minProperties: 1,
        maxProperties: 40,
        additionalProperties: field,
        propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9_-]{0,59}$" },
      },
      method: { enum: ["count", "sum", "mean", "min", "max"] },
      calculation: { enum: ["sum", "difference", "product", "ratio"] },
      sourceId: name,
      rightField: field,
    },
  },
};
const ajv = new Ajv({ strict: false, allowUnionTypes: true });
const checkBindings = ajv.compile(bindingsSchema),
  checkTransforms = ajv.compile(transformsSchema);
export function validateDataSettings(
  bindings: Record<string, DataBinding> = {},
  transforms: DataTransform[] = [],
) {
  if (!checkBindings(bindings))
    throw new Error(
      `Invalid bindings: ${ajv.errorsText(checkBindings.errors)}`,
    );
  if (!checkTransforms(transforms))
    throw new Error(
      `Invalid transforms: ${ajv.errorsText(checkTransforms.errors)}`,
    );
  Object.values(bindings).forEach((b) => {
    if (b.path !== undefined) pathParts(b.path);
  });
  const required: Record<DataTransform["op"], string[]> = {
    select: ["fields"],
    rename: ["field", "as"],
    filter: ["field", "comparison", "value"],
    sort: ["field"],
    limit: ["count"],
    map: ["mapping"],
    derive: ["fields", "as", "calculation"],
    aggregate: ["method"],
    group: ["field", "method"],
    flatten: ["field"],
    merge: ["sourceId"],
    join: ["sourceId", "field", "rightField"],
  };
  transforms.forEach((step) => {
    for (const key of required[step.op])
      if (!Object.hasOwn(step, key))
        throw new Error(`${step.op} requires ${key}.`);
    if (
      ["aggregate", "group"].includes(step.op) &&
      step.method !== "count" &&
      !(step.op === "group" ? step.rightField : step.field)
    )
      throw new Error("Numeric aggregates require a measure field.");
    [
      step.field,
      step.rightField,
      ...(step.fields ?? []),
      ...Object.values(step.mapping ?? {}),
    ].forEach((p) => {
      if (p !== undefined) pathParts(p);
    });
    for (const key of [step.as, ...Object.keys(step.mapping ?? {})])
      if (key && ["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("This output field is reserved.");
  });
}
function aggregate(
  rows: Row[],
  field: string | undefined,
  method: DataTransform["method"],
) {
  if (method === "count") return rows.length;
  const values = rows
    .map((r) => readPath(r, field))
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return null;
  if (method === "min") return Math.min(...values);
  if (method === "max") return Math.max(...values);
  const sum = values.reduce((total, n) => total + n, 0);
  return method === "mean" ? sum / values.length : sum;
}
export function transformData(
  data: unknown,
  steps: DataTransform[],
  lookup: (id: string) => unknown = () => undefined,
): unknown {
  let rows = rowsOf(data).slice(0, 5000);
  for (const step of steps) {
    const value = (row: Row) => readPath(row, step.field);
    switch (step.op) {
      case "select":
        rows = rows.map((r) =>
          Object.fromEntries(step.fields!.map((f) => [f, readPath(r, f)])),
        );
        break;
      case "rename":
        rows = rows.map((r) => {
          const next = { ...r, [step.as!]: value(r) };
          delete next[step.field!];
          return next;
        });
        break;
      case "map":
        rows = rows.map((r) =>
          Object.fromEntries(
            Object.entries(step.mapping!).map(([key, path]) => [
              key,
              readPath(r, path),
            ]),
          ),
        );
        break;
      case "filter":
        rows = rows.filter((r) => {
          const a = value(r),
            b = step.value;
          if (step.comparison === "eq") return a === b;
          if (step.comparison === "ne") return a !== b;
          if (step.comparison === "contains")
            return String(a ?? "")
              .toLowerCase()
              .includes(String(b ?? "").toLowerCase());
          if (a == null || b == null) return false;
          const x = Number(a),
            y = Number(b);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
          return step.comparison === "gt"
            ? x > y
            : step.comparison === "gte"
              ? x >= y
              : step.comparison === "lt"
                ? x < y
                : x <= y;
        });
        break;
      case "sort":
        rows = [...rows].sort((a, b) => {
          const x = value(a),
            y = value(b);
          return (
            (step.direction === "desc" ? -1 : 1) *
            (x != null &&
            y != null &&
            Number.isFinite(Number(x)) &&
            Number.isFinite(Number(y))
              ? Number(x) - Number(y)
              : String(x ?? "").localeCompare(String(y ?? "")))
          );
        });
        break;
      case "limit":
        rows = rows.slice(0, step.count);
        break;
      case "derive":
        rows = rows.map((r) => {
          const numbers = step.fields!.map((f) => {
            const v = readPath(r, f);
            return v == null || v === "" ? NaN : Number(v);
          });
          const output = numbers.every(Number.isFinite)
            ? step.calculation === "sum"
              ? numbers.reduce((a, b) => a + b, 0)
              : step.calculation === "product"
                ? numbers.reduce((a, b) => a * b, 1)
                : step.calculation === "difference"
                  ? numbers.reduce((a, b) => a - b)
                  : numbers
                      .slice(1)
                      .reduce((a, b) => (b ? a / b : NaN), numbers[0])
            : NaN;
          return { ...r, [step.as!]: Number.isFinite(output) ? output : null };
        });
        break;
      case "aggregate":
        rows = [
          { [step.as ?? "value"]: aggregate(rows, step.field, step.method) },
        ];
        break;
      case "group": {
        const groups = new Map<unknown, Row[]>();
        for (const row of rows) {
          const key = value(row);
          groups.set(key, [...(groups.get(key) ?? []), row]);
        }
        rows = [...groups].map(([key, group]) => ({
          [step.field!]: key,
          [step.as ?? "value"]: aggregate(group, step.rightField, step.method),
        }));
        break;
      }
      case "flatten":
        rows = rows.flatMap((r) => rowsOf(value(r))).slice(0, 5000);
        break;
      case "merge":
        rows = [...rows, ...rowsOf(lookup(step.sourceId!))].slice(0, 5000);
        break;
      case "join": {
        const right = new Map<unknown, Row>();
        for (const row of rowsOf(lookup(step.sourceId!)).slice(0, 5000)) {
          const key = readPath(row, step.rightField);
          if (!right.has(key)) right.set(key, row);
        }
        rows = rows.map((r) => ({
          ...r,
          [step.as ?? "joined"]: right.get(value(r)) ?? null,
        }));
        break;
      }
    }
  }
  return steps.length ? rows : data;
}
export function boundResult(widget: Widget, widgets: Widget[]) {
  const issues: string[] = [];
  const provenance: {
    slot: string;
    sourceId: string;
    apiId: string;
    operationId: string;
    path: string;
    origin: string;
    invokedAt?: string;
    status: string;
  }[] = [];
  const own = widget.result;
  if (!own) return { result: undefined, issues, provenance };
  const bindings = widget.bindings ?? {},
    transforms = widget.transforms ?? [];
  if (!Object.keys(bindings).length && !transforms.length)
    return { result: own, issues, provenance };
  function sourceFor(sourceId?: string) {
    const source = sourceId ? widgets.find((w) => w.id === sourceId) : widget;
    if (!source) issues.push(`Source ${sourceId} was removed.`);
    else if (source.status !== "ready")
      issues.push(
        `${source.title}: ${source.status}. Bound values may be missing or stale.`,
      );
    return source;
  }
  function resolve(binding: DataBinding, slot: string, row?: Row) {
    if (Object.hasOwn(binding, "literal")) return binding.literal;
    const source = sourceFor(binding.sourceId);
    if (!source) return undefined;
    const origin = binding.origin ?? "data";
    if (!provenance.some((p) => p.slot === slot))
      provenance.push({
        slot,
        sourceId: source.id,
        apiId: source.invocation.apiId,
        operationId: source.invocation.operationId,
        path: binding.path ?? "",
        origin,
        invokedAt: source.refreshedAt,
        status: source.status,
      });
    const root =
      origin === "raw"
        ? source.rawResponse
        : row && source.id === widget.id
          ? row
          : source.result?.data;
    const value = readPath(root, binding.path);
    if (value === undefined)
      issues.push(`No value at ${binding.path || "$"} in ${source.title}.`);
    return value;
  }
  try {
    let data = bindings.$data ? resolve(bindings.$data, "$data") : own.data;
    data = transformData(
      data,
      transforms,
      (sourceId) => sourceFor(sourceId)?.result?.data,
    );
    const slots = Object.entries(bindings).filter(([slot]) => slot !== "$data");
    const hints: Record<string, SemanticValueType> = {};
    if (slots.length) {
      const perRow =
        !!bindings.$data ||
        slots.some(
          ([, b]) =>
            !Object.hasOwn(b, "literal") &&
            (!b.sourceId || b.sourceId === widget.id) &&
            (b.origin ?? "data") === "data",
        );
      const rows = perRow ? rowsOf(data) : [{}];
      data = rows.map((row) =>
        Object.fromEntries(
          slots.map(([slot, binding]) => {
            const value = resolve(binding, slot, row);
            hints[slot] = detectValue({
              key: [
                "latitude",
                "longitude",
                "image_url",
                "time",
                "timestamp",
              ].includes(slot)
                ? slot
                : (binding.path
                    ?.split(/[.\[\]]/)
                    .filter(Boolean)
                    .at(-1) ?? slot),
              value,
            }).type;
            return [slot, value];
          }),
        ),
      );
    }
    const result = normalizeData(
      data,
      own.source,
      slots.length || bindings.$data
        ? undefined
        : own.suggestedPresentations[0],
      hints,
    );
    if (!slots.length && !bindings.$data) result.metadata = own.metadata;
    for (const field of result.fields)
      if (bindings[field.key]?.label) field.label = bindings[field.key].label!;
    return { result, issues: [...new Set(issues)], provenance };
  } catch (error) {
    return {
      result: undefined,
      issues: [(error as Error).message],
      provenance,
    };
  }
}
