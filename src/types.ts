export const presentations = [
  "auto",
  "metric",
  "stats",
  "text",
  "key-value",
  "record",
  "table",
  "list",
  "cards",
  "image",
  "gallery",
  "line-chart",
  "bar-chart",
  "area-chart",
  "scatter",
  "pie",
  "timeline",
  "map",
  "weather",
  "finance-quote",
  "book",
  "drug",
  "media",
  "link-preview",
  "json",
] as const;
export type PresentationType = (typeof presentations)[number];
export type SemanticValueType =
  | "text"
  | "number"
  | "integer"
  | "currency"
  | "percent"
  | "boolean"
  | "date"
  | "datetime"
  | "duration"
  | "url"
  | "email"
  | "image"
  | "audio"
  | "video"
  | "latitude"
  | "longitude"
  | "coordinate"
  | "identifier"
  | "category"
  | "unknown";
export type Row = Record<string, unknown>;
export interface SemanticField {
  key: string;
  label: string;
  type: SemanticValueType;
  confidence: number;
}
export interface SemanticResult {
  id: string;
  source: {
    apiId: string;
    operationId: string;
    invokedAt: string;
    mode: DataMode;
  };
  shape:
    | "scalar"
    | "record"
    | "collection"
    | "timeseries"
    | "categorical-series"
    | "geo"
    | "image"
    | "image-collection"
    | "media"
    | "document"
    | "unknown";
  data: unknown;
  fields: SemanticField[];
  dimensions: string[];
  measures: string[];
  suggestedPresentations: PresentationType[];
  metadata: Row;
}
export type DataMode = "sample" | "live";
export interface PresentationSpec {
  type: PresentationType;
  xField?: string;
  yField?: string;
  fields?: string[];
}
export interface InputDefinition {
  type: "string" | "number" | "integer" | "date";
  label: string;
  required?: boolean;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  placeholder?: string;
}
export interface Operation {
  id: string;
  title: string;
  description: string;
  inputs: Record<string, InputDefinition>;
  endpoint: string;
  buildUrl: (args: Row) => string;
  extract: (raw: any) => unknown;
  sample: (args: Row) => unknown;
  hints?: Record<string, SemanticValueType>;
  preferred?: PresentationType;
  metadata?: (raw: any) => Row;
}
export interface ApiDefinition {
  id: string;
  name: string;
  description: string;
  categories: string[];
  keywords: string[];
  docs: string;
  icon: string;
  authentication?: "none" | "api-key";
  liveNotice?: string;
  operations: Operation[];
}
export interface NormalizedError {
  code: string;
  title: string;
  message: string;
  retryAfter?: number;
}
export interface WidgetInput {
  apiId: string;
  operationId: string;
  arguments: Row;
  title?: string;
  presentation?: PresentationType;
  width?: number;
  mode?: DataMode;
}
export interface Widget {
  id: string;
  title: string;
  invocation: {
    apiId: string;
    operationId: string;
    arguments: Row;
    mode: DataMode;
  };
  presentation: PresentationSpec;
  width: number;
  status:
    "draft" | "needs-input" | "loading" | "ready" | "refreshing" | "error";
  rawResponse?: unknown;
  result?: SemanticResult;
  error?: NormalizedError;
  missingInputs: string[];
  createdAt: string;
  refreshedAt?: string;
  requestUrl?: string;
  durationMs?: number;
}
