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
  "histogram",
  "comparison",
  "document",
  "calendar",
  "graph",
  "sports-score",
  "sports-team",
  "places",
  "news",
  "events",
  "person",
  "product",
  "embed",
  "video",
  "audio",
  "note",
  "file",
  "stock-chart",
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
  | "object"
  | "array"
  | "measurement"
  | "unknown";
export type Row = Record<string, unknown>;
export interface SemanticField {
  unit?: string;
  key: string;
  label: string;
  type: SemanticValueType;
  confidence: number;
  path?: string;
  nullable?: boolean;
  sample?: unknown;
  children?: SemanticField[];
  primitiveType?:
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "object"
    | "array"
    | "null"
    | "mixed";
  semanticType?: string;
  evidence?: string[];
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
  fieldTree?: SemanticField[];
  dimensions: string[];
  measures: string[];
  suggestedPresentations: PresentationType[];
  metadata: Row;
  structure?: {
    rootType: string;
    collectionPath?: string;
    recordCount: number;
  };
}
// The existing normalized result is the canonical envelope. Raw JSON stays on
// its request entry so multiple cards can share it without copying payloads.
export type DataEnvelope = SemanticResult;
export interface ApiResponse {
  result: SemanticResult;
  rawResponse: unknown;
  requestUrl: string;
  durationMs: number;
}
export type DataMode = "sample" | "live";
export interface PresentationSpec {
  type: PresentationType;
  xField?: string;
  yField?: string;
  series?: string[];
  fields?: string[];
  props?: {
    filter?: string;
    sort?: string;
    sortDirection?: "asc" | "desc";
    compact?: boolean;
    numberFormat?: "compact" | "standard";
    stockStyle?: "candles" | "line";
    stockSymbol?: string;
    showSource?: boolean;
    style?: BlockStyle;
  };
}
export interface DataBinding {
  sourceId?: string;
  path?: string;
  origin?: "raw" | "data";
  literal?: string | number | boolean | null;
  label?: string;
}
export interface DataTransform {
  op:
    | "select"
    | "rename"
    | "filter"
    | "sort"
    | "limit"
    | "map"
    | "derive"
    | "aggregate"
    | "group"
    | "flatten"
    | "merge"
    | "join";
  field?: string;
  fields?: string[];
  as?: string;
  value?: string | number | boolean | null;
  comparison?: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains";
  direction?: "asc" | "desc";
  count?: number;
  mapping?: Record<string, string>;
  method?: "count" | "sum" | "mean" | "min" | "max";
  calculation?: "sum" | "difference" | "product" | "ratio";
  sourceId?: string;
  rightField?: string;
}
export interface CustomApiConfig {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  inputs?: Record<string, InputDefinition>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  sampleResponse: unknown;
  responsePath?: string;
  responseSchema?: Row;
  authentication?: "none" | "api-key";
  format?: SourceFormat;
  selector?: string;
  permitted?: boolean;
  attribution?: string;
  license?: string;
  refreshSeconds?: number;
  pagination?: PaginationConfig;
  transforms?: DataTransform[];
}
export const sourceFormats = [
  "auto",
  "json",
  "csv",
  "xml",
  "rss",
  "atom",
  "jsonld",
  "html-table",
  "embedded-json",
  "graphql",
  "openapi",
  "socrata",
  "ckan",
  "arcgis",
] as const;
export type SourceFormat = (typeof sourceFormats)[number];
export interface PaginationConfig {
  mode: "page" | "offset" | "cursor" | "next";
  parameter?: string;
  start?: number;
  sizeParameter?: string;
  size?: number;
  nextPath?: string;
  maxPages: number;
}
export interface TaggedField {
  sourceId: string;
  path: string;
  origin: "raw" | "data";
  label?: string;
  tags: string[];
  unit?: string;
}
export interface InputDefinition {
  type: "string" | "number" | "integer" | "date";
  label: string;
  required?: boolean;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  placeholder?: string;
  enum?: string[];
}
export interface Operation {
  sourceConfig?: CustomApiConfig;
  id: string;
  title: string;
  description: string;
  inputs: Record<string, InputDefinition>;
  endpoint: string;
  method?: CustomApiConfig["method"];
  buildRequest?: (args: Row) => {
    headers?: Record<string, string>;
    body?: string;
  };
  responseSchema?: Row;
  buildUrl: (args: Row) => string;
  extract: (raw: any) => unknown;
  sample: (args: Row) => unknown;
  hints?: Record<string, SemanticValueType>;
  preferred?: PresentationType;
  metadata?: (raw: any) => Row;
  capability?: {
    id: string;
    intents: string[];
    examples: { prompt: string; arguments: Row }[];
    views?: PresentationType[];
  };
  collectionPath?: string;
  cacheTtlMs?: number;
  expand?: { path: string; max: number; parameter: string; url: string };
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
  keySetup?: { environmentVariable: string; url: string; message: string };
  accessNote?: string;
  operations: Operation[];
  browser?: { expectedCors: "yes" | "no" | "unknown" };
  attribution?: string;
}
export interface NormalizedError {
  code: string;
  title: string;
  message: string;
  retryAfter?: number;
}
export interface WidgetInput {
  content?: CanvasContent;
  contentMeta?: ContentMeta;
  derived?: { sourceIds: string[] };
  apiId: string;
  operationId: string;
  arguments: Row;
  title?: string;
  presentation?: PresentationType;
  width?: number;
  mode?: DataMode;
  bindings?: Record<string, DataBinding>;
  transforms?: DataTransform[];
}
export interface Widget {
  content?: CanvasContent;
  contentMeta?: ContentMeta;
  viewError?: NormalizedError;
  derived?: { sourceIds: string[] };
  id: string;
  title: string;
  invocation: {
    apiId: string;
    operationId: string;
    arguments: Row;
    mode: DataMode;
  };
  presentation: PresentationSpec;
  bindings?: Record<string, DataBinding>;
  transforms?: DataTransform[];
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

export interface CanvasContent {
  version: 1;
  kind:
    | "note"
    | "summary"
    | "answer"
    | "question"
    | "search-results"
    | "file"
    | "dataset"
    | "embed";
  title: string;
  body?: string;
  question?: string;
  url?: string;
  mediaType?: "auto" | "video" | "audio" | "iframe";
  records?: Row[];
  file?: { name: string; format: "txt" | "md" | "json" | "csv"; text: string };
  citations?: {
    blockId?: string;
    path?: string;
    origin?: "raw" | "data";
    url?: string;
    label: string;
  }[];
  sourceIds?: string[];
  files?: LocalFileReference[];
  answerTo?: string;
}
export interface BlockStyle {
  background?: string;
  color?: string;
  borderColor?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
}
export interface LocalFileReference {
  id: string;
  name: string;
  access: "snapshot" | "handle" | "reference";
  uri?: string;
  mediaType?: string;
  size?: number;
  lastModified?: number;
  data?: unknown;
  previewIssue?: string;
}
export interface ContentMeta {
  origin: "user" | "agent" | "computed";
  updatedAt: string;
  evidence: Record<string, string>;
}
