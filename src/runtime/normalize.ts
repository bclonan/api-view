import { detectValue, labelFor } from "./detectValue";
import type {
  Operation,
  SemanticResult,
  Row,
  PresentationType,
  DataMode,
  SemanticField,
} from "../types";
export const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const rowsOf = (data: unknown): Row[] =>
  Array.isArray(data)
    ? data.map((v) => (isRow(v) ? v : { value: v }))
    : isRow(data)
      ? [data]
      : data === undefined || data === null
        ? []
        : [{ value: data }];
export const numericTypes = ["number", "integer", "currency", "percent"];
export function detectShape(
  data: unknown,
  fields: SemanticField[],
): SemanticResult["shape"] {
  const types = fields.map((f) => f.type);
  if (types.includes("latitude") && types.includes("longitude")) return "geo";
  if (types.includes("image"))
    return Array.isArray(data) ? "image-collection" : "image";
  if (types.some((t) => ["audio", "video"].includes(t))) return "media";
  if (Array.isArray(data)) {
    if (
      types.some((t) => ["date", "datetime"].includes(t)) &&
      types.some((t) => numericTypes.includes(t))
    )
      return "timeseries";
    if (
      types.some((t) => ["text", "category"].includes(t)) &&
      types.some((t) => numericTypes.includes(t))
    )
      return "categorical-series";
    return "collection";
  }
  return isRow(data)
    ? "record"
    : data === undefined || data === null
      ? "unknown"
      : "scalar";
}
export function resolvePresentation(
  shape: SemanticResult["shape"],
  data: unknown,
  preferred?: PresentationType,
): PresentationType[] {
  const base: Record<SemanticResult["shape"], PresentationType[]> = {
    scalar:
      typeof data === "number" ? ["metric", "text"] : ["text", "key-value"],
    record:
      Object.keys(isRow(data) ? data : {}).length <= 8
        ? ["key-value", "record", "stats"]
        : ["record", "key-value"],
    collection:
      rowsOf(data).length <= 5
        ? ["cards", "list", "table"]
        : ["table", "list", "cards"],
    timeseries: [
      "line-chart",
      "area-chart",
      "table",
      "bar-chart",
      "metric",
      "timeline",
    ],
    "categorical-series": ["bar-chart", "table", "pie", "cards"],
    geo: ["map", "table", "timeline", "scatter"],
    image: ["image", "record", "link-preview"],
    "image-collection": ["gallery", "cards", "list", "table"],
    media: ["media", "record"],
    document: ["text", "link-preview"],
    unknown: ["json", "key-value"],
  };
  return [
    ...new Set([
      ...(preferred ? [preferred] : []),
      ...base[shape],
      "json" as const,
    ]),
  ];
}
export function normalize(
  raw: unknown,
  operation: Operation,
  apiId: string,
  mode: DataMode,
): SemanticResult {
  const data = operation.extract(raw);
  const rows = rowsOf(data);
  const keys = [...new Set(rows.slice(0, 30).flatMap(Object.keys))];
  const fields = keys.map((key) => ({
    key,
    label: labelFor(key),
    ...(operation.hints?.[key]
      ? { type: operation.hints[key], confidence: 1 }
      : detectValue({
          key,
          value: rows.find((r) => r[key] !== undefined && r[key] !== null)?.[
            key
          ],
        })),
  }));
  const shape = detectShape(data, fields);
  return {
    id: crypto.randomUUID(),
    source: {
      apiId,
      operationId: operation.id,
      invokedAt: new Date().toISOString(),
      mode,
    },
    shape,
    data,
    fields,
    dimensions: fields
      .filter((f) => !numericTypes.includes(f.type))
      .map((f) => f.key),
    measures: fields
      .filter((f) => numericTypes.includes(f.type))
      .map((f) => f.key),
    suggestedPresentations: resolvePresentation(
      shape,
      data,
      operation.preferred,
    ),
    metadata: operation.metadata?.(raw) ?? {},
  };
}
