import { discoverFields, flattenFields } from "./fields";
import { inferStructure, normalizeStructure } from "./structure";
import { compatibleHint, isMeasure } from "./semantics";
import { compatibleComponents } from "../blocks/definitions";
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
export const numericTypes = [
  "number",
  "integer",
  "currency",
  "percent",
  "measurement",
];
export function numberOf(value: unknown) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return value;
  const text = String(value)
    .trim()
    .replace(/[$€£,]/g, "")
    .replace(/\s*(%|kg|km\/h|m\/s|km|cm|mm|mg|m|g|°[CF]|kWh|W|Hz)$/i, "");
  return text ? Number(text) : NaN;
}
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
  const structure = inferStructure(raw, operation.collectionPath);
  const extracted = operation.extract ? operation.extract(raw) : structure.data;
  const data = normalizeStructure(extracted);
  const fieldTree = discoverFields(data);
  const discovered = flattenFields(fieldTree);
  const fields = discovered.map((field) => ({
    ...field,
    key: field.key,
    label: field.label,
    ...(operation.hints?.[field.key] &&
    compatibleHint(field, operation.hints[field.key])
      ? { type: operation.hints[field.key], confidence: 1 }
      : {}),
  }));
  /* Field discovery samples multiple records without rewriting their values. */
  const shape = detectShape(data, fields);
  const result: SemanticResult = {
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
    fieldTree,
    dimensions: fields.filter((f) => !isMeasure(f)).map((f) => f.key),
    measures: fields.filter(isMeasure).map((f) => f.key),
    suggestedPresentations: resolvePresentation(
      shape,
      data,
      operation.preferred,
    ),
    metadata: operation.metadata?.(raw) ?? {},
    structure: {
      rootType: shape,
      collectionPath: structure.collectionPath,
      recordCount: rowsOf(data).length,
    },
  };
  const candidates = compatibleComponents(result).filter((c) => c.compatible);
  result.suggestedPresentations = candidates.map((c) => c.id);
  if (
    operation.preferred &&
    candidates.some((c) => c.id === operation.preferred)
  )
    result.suggestedPresentations = [
      operation.preferred,
      ...result.suggestedPresentations.filter(
        (id) => id !== operation.preferred,
      ),
    ];
  return result;
}
export function normalizeData(
  data: unknown,
  source: SemanticResult["source"],
  preferred?: PresentationType,
  hints?: Operation["hints"],
) {
  const result = normalize(
    data,
    {
      id: source.operationId,
      extract: (v: unknown) => v,
      preferred,
      hints,
    } as Operation,
    source.apiId,
    source.mode,
  );
  result.source = source;
  return result;
}
