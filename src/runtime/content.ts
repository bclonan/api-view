import Ajv from "ajv";
import type { CanvasContent, ContentMeta, Widget } from "../types";
import { normalizeData } from "./normalize";
import { pathParts, readPath } from "./fields";
import { boundResult } from "./bindings";
import { publicSourceUrl, stableId } from "../sources/security";

const short = { type: "string", minLength: 1, maxLength: 120 };
const link = {
  type: "string",
  minLength: 8,
  maxLength: 3000,
  pattern: "^https://",
};
export const contentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "kind", "title"],
  properties: {
    version: { const: 1 },
    kind: {
      enum: [
        "note",
        "summary",
        "answer",
        "question",
        "search-results",
        "file",
        "dataset",
        "embed",
      ],
    },
    title: short,
    body: { type: "string", maxLength: 20000 },
    question: { type: "string", maxLength: 2000 },
    answerTo: short,
    files: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "access"],
        properties: {
          id: { ...short, pattern: "^local-[A-Za-z0-9-]+$" },
          name: { ...short, pattern: "^[^/\\\\]+$" },
          access: { enum: ["snapshot", "handle", "reference"] },
          uri: {
            type: "string",
            minLength: 1,
            maxLength: 3000,
            pattern: "^(file:|filesystem:|content:|[A-Za-z]:[\\\\/]|/)",
          },
          mediaType: { type: "string", maxLength: 120 },
          size: { type: "integer", minimum: 0, maximum: 2147483648 },
          lastModified: { type: "integer", minimum: 0 },
          data: {},
          previewIssue: { type: "string", maxLength: 500 },
        },
      },
    },
    url: link,
    mediaType: { enum: ["auto", "video", "audio", "iframe"] },
    sourceIds: { type: "array", maxItems: 40, uniqueItems: true, items: short },
    records: {
      type: "array",
      maxItems: 1000,
      items: { type: "object", maxProperties: 100 },
    },
    file: {
      type: "object",
      additionalProperties: false,
      required: ["name", "format", "text"],
      properties: {
        name: { ...short, pattern: "^[^/\\\\]+$" },
        format: { enum: ["txt", "md", "json", "csv"] },
        text: { type: "string", maxLength: 100000 },
      },
    },
    citations: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: {
          blockId: short,
          label: short,
          path: { type: "string", maxLength: 500 },
          origin: { enum: ["raw", "data"] },
          url: link,
        },
        anyOf: [{ required: ["blockId"] }, { required: ["url"] }],
      },
    },
  },
};
const ajv = new Ajv({ strict: false });
const check = ajv.compile(contentSchema);
export function validateContent(
  value: unknown,
): asserts value is CanvasContent {
  if (!check(value))
    throw new Error(`Invalid canvas content: ${ajv.errorsText(check.errors)}`);
  const v = value as unknown as CanvasContent;
  const text = JSON.stringify(value);
  if (text.length > 150000)
    throw new Error("Keep a content card below 150 KB. Link to larger files.");
  JSON.parse(text, (key, item) => {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error("Reserved field name in content.");
    return item;
  });
  if (!v.title.trim()) throw new Error("Content needs a title.");
  if (["dataset", "search-results"].includes(v.kind) && !v.records)
    throw new Error(
      "This content kind requires records, including an empty array for no results.",
    );
  if (v.files && new Set(v.files.map((f) => f.id)).size !== v.files.length)
    throw new Error("Each local file reference needs a unique ID.");
  if (v.files && v.kind !== "file")
    throw new Error("Add local references to a file content card.");
  if (v.kind === "file" && !v.file && !v.url && !v.files?.length)
    throw new Error(
      "A file card needs a local reference, text file or public URL.",
    );
  if (v.kind === "embed" && !v.url)
    throw new Error("An embed needs a public HTTPS URL.");
  if (
    ["note", "summary", "answer", "question"].includes(v.kind) &&
    !v.body?.trim()
  )
    throw new Error("Write the card's text in body.");
  if (v.url) publicSourceUrl(v.url);
  for (const citation of v.citations ?? []) {
    if (citation.url) publicSourceUrl(citation.url);
    if (citation.path) pathParts(citation.path);
    if (citation.path && !citation.blockId)
      throw new Error("A citation path needs a source block ID.");
  }
  if (v.file?.format === "json") {
    try {
      JSON.parse(v.file.text);
    } catch {
      throw new Error("The attached JSON file is not valid JSON.");
    }
  }
  if (v.file && !v.file.name.toLowerCase().endsWith(`.${v.file.format}`))
    throw new Error(`Use a .${v.file.format} filename for this text file.`);
}
export function contentFingerprint(widget: Widget, widgets: Widget[]) {
  return stableId("evidence", {
    data: boundResult(widget, widgets).result?.data,
    raw: widget.rawResponse,
    bindings: widget.bindings,
    transforms: widget.transforms,
    filters: widget.presentation.props,
    status: widget.status,
  });
}
export function contentEvidence(
  content: CanvasContent,
  widgets: Widget[],
  selfId?: string,
) {
  const ids = new Set([
    ...(content.sourceIds ?? []),
    ...(content.citations ?? []).flatMap((c) => (c.blockId ? [c.blockId] : [])),
  ]);
  const evidence: Record<string, string> = {};
  for (const id of ids) {
    if (id === selfId) throw new Error("A content card cannot cite itself.");
    const source = widgets.find((w) => w.id === id);
    if (!source)
      throw new Error(`Source card ${id} was removed. Choose a current card.`);
    evidence[id] = contentFingerprint(source, widgets);
  }
  for (const citation of content.citations ?? []) {
    const source = widgets.find((w) => w.id === citation.blockId);
    if (
      source &&
      citation.path &&
      readPath(
        citation.origin === "raw"
          ? source.rawResponse
          : boundResult(source, widgets).result?.data,
        citation.path,
      ) === undefined
    )
      throw new Error(
        `Citation path ${citation.path} is unavailable in ${source.title}. Inspect the source before citing it.`,
      );
  }
  return evidence;
}
export function contentIssues(widget: Widget, widgets: Widget[]) {
  return Object.entries(widget.contentMeta?.evidence ?? {}).flatMap(
    ([id, fingerprint]) => {
      const source = widgets.find((w) => w.id === id);
      if (
        source?.content?.files?.some(
          (file) =>
            file.previewIssue ===
            "Local files are not included in shared views.",
        )
      )
        return [
          `${source.title}: local attachment data is excluded from this snapshot. Cited file values cannot be checked here.`,
        ];
      return !source
        ? [`Cited source ${id} was removed.`]
        : contentFingerprint(source, widgets) !== fingerprint
          ? [
              `${source.title} changed since this content was written. Review or regenerate it.`,
            ]
          : [];
    },
  );
}
export function contentResult(content: CanvasContent, meta: ContentMeta) {
  const preferred =
    content.kind === "dataset"
      ? undefined
      : content.kind === "embed"
        ? "embed"
        : content.kind === "file"
          ? "file"
          : content.kind === "search-results"
            ? "news"
            : "note";
  const data =
    content.records ??
    (content.kind === "embed"
      ? { title: content.title, url: content.url, mediaType: content.mediaType }
      : content);
  const result = normalizeData(
    data,
    {
      apiId: "canvas-content",
      operationId: "content",
      invokedAt: meta.updatedAt,
      mode: "live",
    },
    preferred,
  );
  result.id = stableId("content-data", { content, meta });
  result.metadata = {
    ...result.metadata,
    canvasContent: content,
    authorship: meta,
  };
  return result;
}
