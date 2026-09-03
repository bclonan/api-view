import { XMLValidator } from "fast-xml-parser";
import { DOMParser } from "linkedom";
import { inferStructure } from "../runtime/structure";
import type { Row, SourceFormat } from "../types";

export const sourceAdapters = [
  { id: "json", name: "JSON endpoint" },
  { id: "csv", name: "CSV file" },
  { id: "xml", name: "XML document" },
  { id: "rss", name: "RSS feed" },
  { id: "atom", name: "Atom feed" },
  { id: "jsonld", name: "Structured webpage data" },
  { id: "html-table", name: "Webpage table" },
  { id: "embedded-json", name: "Embedded JSON" },
  { id: "graphql", name: "GraphQL response" },
  { id: "openapi", name: "OpenAPI or Swagger document" },
  { id: "socrata", name: "Socrata dataset" },
  { id: "ckan", name: "CKAN dataset" },
  { id: "arcgis", name: "ArcGIS feature query" },
] as const;
export function detectFormat(
  text: string,
  contentType = "",
  url = "",
): SourceFormat {
  const trimmed = text.trim();
  if (/^[[{]/.test(trimmed)) {
    let value: any;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return "json";
    }
    if (value.openapi || value.swagger) return "openapi";
    if (value["@context"]) return "jsonld";
    if (
      /\/api\/3\/action\//.test(url) ||
      (value.success !== undefined && value.result)
    )
      return "ckan";
    if (
      /arcgis|FeatureServer|MapServer/i.test(url) ||
      value.features?.[0]?.attributes
    )
      return "arcgis";
    if (/\/resource\/[^/]+\.json|\/api\/views\//.test(url)) return "socrata";
    if (/graphql/i.test(url) || value.data?.__schema) return "graphql";
    return "json";
  }
  if (/<rss\b|<rdf:RDF\b/i.test(trimmed)) return "rss";
  if (/<feed\b/i.test(trimmed)) return "atom";
  if (
    /<(?:html|!doctype html)\b/i.test(trimmed) ||
    /text\/html/i.test(contentType)
  ) {
    if (/<script[^>]*application\/ld\+json/i.test(trimmed)) return "jsonld";
    if (/<table\b/i.test(trimmed)) return "html-table";
    return "embedded-json";
  }
  if (/^<\?xml|^<[a-z][^>]*>/i.test(trimmed)) return "xml";
  if (
    /csv|tab-separated/.test(contentType) ||
    /\.(csv|tsv)(\?|$)/i.test(url) ||
    /^[^\n]*[,\t][^\n]*\r?\n/.test(text)
  )
    return "csv";
  return "auto";
}
function scalar(value: string): unknown {
  const text = value.trim();
  if (
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text) &&
    Number.isFinite(Number(text)) &&
    (!Number.isInteger(Number(text)) || Number.isSafeInteger(Number(text)))
  )
    return Number(text);
  if (text === "true" || text === "false") return text === "true";
  return text;
}
export function parseCsv(text: string): Row[] {
  text = text.replace(/^\uFEFF/, "");
  const delimiter =
    (text.split(/\r?\n/)[0].match(/\t/g)?.length ?? 0) >
    (text.split(/\r?\n/)[0].match(/,/g)?.length ?? 0)
      ? "\t"
      : ",";
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else cell += c;
    } else if (!quoted && (c === delimiter || c === "\n" || c === "\r")) {
      row.push(cell);
      cell = "";
      if (c !== delimiter) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some((v) => v.trim())) records.push(row);
        row = [];
      }
    } else cell += c;
    if (records.length > 5000)
      throw new Error(
        "CSV exceeds 5,000 rows. Use pagination or a smaller file.",
      );
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(cell);
  if (row.some((v) => v.trim())) records.push(row);
  const headers =
    records.shift()?.map((key, i) => key.trim() || `column_${i + 1}`) ?? [];
  if (headers.length > 100 || new Set(headers).size !== headers.length)
    throw new Error("CSV needs unique headers and at most 100 columns.");
  return records.map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(
        `CSV row ${index + 2} has ${cells.length} values for ${headers.length} columns.`,
      );
    return Object.fromEntries(headers.map((key, i) => [key, scalar(cells[i])]));
  });
}
const textOf = (node: any, selector: string) =>
  node.querySelector(selector)?.textContent?.trim() ?? "";
const absolute = (value: string, url: string) => {
  try {
    const result = new URL(value, url);
    return /^https?:$/.test(result.protocol) ? result.href : "";
  } catch {
    return "";
  }
};
function xmlValue(node: any, depth = 0): unknown {
  if (depth > 12) throw new Error("XML nesting exceeds 12 levels.");
  const children = Array.from(node.children ?? []) as any[];
  if (!children.length && !node.attributes?.length)
    return scalar(node.textContent ?? "");
  const entries: Row = {};
  for (const attr of Array.from(node.attributes ?? []) as any[])
    entries[`@${attr.name}`] = attr.value;
  for (const child of children) {
    const key = child.localName ?? child.nodeName,
      value = xmlValue(child, depth + 1);
    if (Object.hasOwn(entries, key))
      entries[key] = Array.isArray(entries[key])
        ? [...(entries[key] as unknown[]), value]
        : [entries[key], value];
    else entries[key] = value;
  }
  if (!children.length) entries.text = scalar(node.textContent ?? "");
  return entries;
}
export function decodeSource(
  text: string,
  options: {
    format?: SourceFormat;
    contentType?: string;
    url: string;
    selector?: string;
    permitted?: boolean;
  },
) {
  if (text.length > 5_000_000)
    throw new Error("Source exceeds the 5 MB response limit.");
  const detected = detectFormat(text, options.contentType, options.url),
    format =
      options.format && options.format !== "auto" ? options.format : detected;
  if (/<!ENTITY|<!DOCTYPE(?!\s+html\s*>)/i.test(text))
    throw new Error(
      "External entities and document type definitions are not supported.",
    );
  const metadata: Row = { format, sourceUrl: options.url };
  if (format === "csv") return { value: parseCsv(text), raw: text, metadata };
  const markup = /^\s*</.test(text);
  if (markup && ["jsonld", "html-table", "embedded-json"].includes(format)) {
    if (!options.permitted)
      throw new Error(
        "Confirm that you are permitted to extract this public webpage before reading its structured data.",
      );
    const doc = new DOMParser().parseFromString(
      text,
      "text/html",
    ) as unknown as Document;
    const robots =
      doc.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";
    if (/noindex|noarchive|nosnippet|none/i.test(robots))
      throw new Error(
        "This page declares indexing or extraction restrictions. Choose a permitted source.",
      );
    metadata.title = textOf(doc, "title");
    metadata.license = doc
      .querySelector('link[rel="license"],a[rel="license"]')
      ?.getAttribute("href");
    if (format === "html-table") {
      const table = doc.querySelector(options.selector || "table");
      if (!table)
        throw new Error(
          "No matching table was found. Choose another selector or source format.",
        );
      const trs = Array.from(table.querySelectorAll("tr"))
        .filter((tr) => !tr.closest("tfoot"))
        .slice(0, 5001);
      const matrix = trs.map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) => {
          if (
            Number(cell.getAttribute("rowspan") ?? 1) > 1 ||
            Number(cell.getAttribute("colspan") ?? 1) > 1
          )
            throw new Error(
              "Merged table cells need an explicit mapping. Choose a table without row or column spans.",
            );
          return cell.textContent?.trim() ?? "";
        }),
      );
      const headers =
        matrix.shift()?.map((v, i) => v || `column_${i + 1}`) ?? [];
      if (new Set(headers).size !== headers.length)
        throw new Error("Table headers must be unique.");
      return {
        value: matrix
          .filter((r) => r.length)
          .map((r, i) => {
            if (r.length !== headers.length)
              throw new Error(`Table row ${i + 2} does not match its headers.`);
            return Object.fromEntries(headers.map((h, j) => [h, scalar(r[j])]));
          }),
        raw: text,
        metadata,
      };
    }
    const scripts = Array.from(
      doc.querySelectorAll(
        options.selector ||
          (format === "jsonld"
            ? 'script[type="application/ld+json"]'
            : 'script[type="application/json"]'),
      ),
    ).slice(0, 20);
    if (!scripts.length)
      throw new Error(
        "This page has no supported structured data. It may need a different selector, an API endpoint, or a separately approved server adapter.",
      );
    const values = scripts.flatMap((script) => {
      const value = JSON.parse(script.textContent ?? "");
      return value["@graph"] ?? value;
    });
    return { value: values, raw: text, metadata };
  }
  if (["xml", "rss", "atom"].includes(format)) {
    const validation = XMLValidator.validate(text);
    if (validation !== true)
      throw new Error(`Invalid XML: ${validation.err.msg}`);
    const doc = new DOMParser().parseFromString(
      text,
      "text/xml",
    ) as unknown as Document;
    if (!doc.documentElement || doc.querySelector("parsererror"))
      throw new Error("The source did not return valid XML.");
    if (format === "xml")
      return {
        value: {
          [doc.documentElement.localName]: xmlValue(doc.documentElement),
        },
        raw: text,
        metadata,
      };
    const nodes = Array.from(
      doc.querySelectorAll(format === "atom" ? "entry" : "item"),
    ).slice(0, 5000);
    return {
      value: nodes.map((node) => ({
        title: textOf(node, "title"),
        description: textOf(node, "description") || textOf(node, "summary"),
        date:
          textOf(node, "pubDate") ||
          textOf(node, "published") ||
          textOf(node, "updated"),
        link: absolute(
          textOf(node, "link") ||
            node.querySelector("link")?.getAttribute("href") ||
            "",
          options.url,
        ),
        id: textOf(node, "guid") || textOf(node, "id"),
        author: textOf(node, "author"),
        ...(node.querySelector("enclosure")?.getAttribute("url")
          ? {
              media_url: absolute(
                node.querySelector("enclosure")!.getAttribute("url")!,
                options.url,
              ),
            }
          : {}),
      })),
      raw: text,
      metadata,
    };
  }
  if (format === "auto")
    throw new Error(
      "Unsupported response format. Choose JSON, CSV, XML, a feed or permitted structured HTML.",
    );
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The source did not return valid JSON.");
  }
  if (format === "graphql" && raw.errors?.length)
    throw new Error(
      `GraphQL returned errors: ${raw.errors
        .map((e: any) => e.message)
        .join("; ")
        .slice(0, 500)}`,
    );
  if (format === "ckan" && raw.success === false)
    throw new Error(
      "CKAN rejected this request. Check the action name and dataset identifier.",
    );
  if (format === "arcgis" && raw.error)
    throw new Error(
      `ArcGIS ${raw.error.code ?? ""}: ${raw.error.message ?? "request failed"}`,
    );
  let value = raw;
  if (format === "graphql") value = raw.data ?? raw;
  if (format === "arcgis" && Array.isArray(raw.features))
    value = raw.features.map((f: any) => ({
      ...f.attributes,
      ...(f.geometry?.x !== undefined
        ? { longitude: f.geometry.x, latitude: f.geometry.y }
        : { geometry: f.geometry }),
    }));
  if (format === "ckan")
    value = raw.result?.records ?? raw.result?.results ?? raw.result ?? raw;
  if (format === "jsonld") value = raw["@graph"] ?? raw;
  if (
    format === "socrata" &&
    Array.isArray(raw.data) &&
    raw.meta?.view?.columns
  ) {
    const columns = raw.meta.view.columns;
    value = raw.data.map((row: any[]) =>
      Object.fromEntries(
        columns.map((c: any, i: number) => [c.fieldName ?? c.name, row[i]]),
      ),
    );
  }
  if (format === "openapi") metadata.documentation = true;
  return { value, raw, metadata };
}
export function datasetOf(value: unknown, path?: string) {
  return inferStructure(value, path || undefined).data;
}
