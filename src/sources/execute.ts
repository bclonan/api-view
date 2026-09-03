import type {
  ApiDefinition,
  Operation,
  Row,
  DataMode,
  ApiResponse,
} from "../types";
import { normalize, rowsOf } from "../runtime/normalize";
import { readPath } from "../runtime/fields";
import { readLocal, writeLocal, pruneLocal } from "../runtime/persistence";
import { decodeSource } from "./adapters";
import { readPublicResponse, checkPagePermission } from "./fetch";
import { publicSourceUrl, stableId, assertPublicSettings } from "./security";
import { transformData } from "../runtime/bindings";
import { datasetOf } from "./adapters";
import Ajv from "ajv";
const responseValidator = new Ajv({ strict: false, allowUnionTypes: true });

export async function executeSource(
  api: ApiDefinition,
  operation: Operation,
  args: Row,
  mode: DataMode,
  signal?: AbortSignal,
  fresh = false,
): Promise<ApiResponse> {
  const config = operation.sourceConfig!,
    url = operation.buildUrl(args),
    options = operation.buildRequest?.(args) ?? {},
    started = performance.now();
  assertPublicSettings({ url, headers: options.headers, body: options.body });
  const canonical = new URL(url);
  canonical.searchParams.sort();
  const key = `cache:${stableId("source", { config, args, url: canonical.href })}`;
  const cached =
    mode === "live" && !fresh && config.method === "GET"
      ? await readLocal<{ response: ApiResponse; expiresAt: number }>(key)
      : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    signal?.throwIfAborted();
    const response = structuredClone(cached.response);
    response.result.metadata.transport = {
      ...(response.result.metadata.transport as Row),
      cached: true,
    };
    return response;
  }
  const timeout = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
    : AbortSignal.timeout(20000);
  let rawResponse: unknown,
    payload: unknown,
    adapterMetadata: Row = {},
    bytes = 0,
    lastModified: string | null = null;
  const pages: { url: string; response: unknown }[] = [],
    allRows: Row[] = [];
  let current = url;
  const pageConfig = config.pagination;
  const count = mode === "sample" ? 1 : (pageConfig?.maxPages ?? 1);
  const seen = new Set<string>();
  for (let page = 0; page < count; page++) {
    timeout.throwIfAborted();
    const target = new URL(current);
    if (pageConfig && ["page", "offset"].includes(pageConfig.mode)) {
      target.searchParams.set(
        pageConfig.parameter ??
          (pageConfig.mode === "page" ? "page" : "offset"),
        String(
          (pageConfig.start ?? (pageConfig.mode === "page" ? 1 : 0)) +
            page *
              (pageConfig.mode === "offset" ? (pageConfig.size ?? 100) : 1),
        ),
      );
      if (pageConfig.sizeParameter)
        target.searchParams.set(
          pageConfig.sizeParameter,
          String(pageConfig.size ?? 100),
        );
    }
    if (seen.has(target.href))
      throw new Error(
        "Pagination repeated the same URL. Check the next-page mapping.",
      );
    seen.add(target.href);
    if (mode === "sample") {
      rawResponse = operation.sample(args);
      if (
        typeof rawResponse === "string" &&
        config.format &&
        config.format !== "json"
      ) {
        const parsed = decodeSource(rawResponse, {
          url,
          format: config.format,
          selector: config.selector,
          permitted: config.permitted,
        });
        payload = parsed.value;
        adapterMetadata = parsed.metadata;
      } else payload = rawResponse;
    } else {
      if (
        config.format &&
        ["html-table", "embedded-json"].includes(config.format)
      )
        await checkPagePermission(target.href, config.permitted, timeout);
      const response = await readPublicResponse(
        target.href,
        {
          method: config.method,
          headers: {
            Accept:
              "application/json, text/csv, application/xml, text/html;q=0.8",
            ...options.headers,
          },
          ...(options.body ? { body: options.body } : {}),
        },
        timeout,
      );
      bytes += response.bytes;
      if (bytes > 5_000_000)
        throw new Error("The combined pages exceed 5 MB. Request fewer pages.");
      if (
        /text\/html/i.test(response.contentType) ||
        /^\s*(?:<!doctype html|<html)/i.test(response.text)
      )
        await checkPagePermission(target.href, config.permitted, timeout);
      const parsed = decodeSource(response.text, {
        url: target.href,
        contentType: response.contentType,
        format: config.format,
        selector: config.selector,
        permitted: config.permitted,
      });
      payload = parsed.value;
      rawResponse = parsed.raw;
      adapterMetadata = {
        ...parsed.metadata,
        httpStatus: response.status,
        contentType: response.contentType,
      };
      lastModified = response.lastModified;
    }
    pages.push({ url: target.href, response: rawResponse });
    if (
      operation.responseSchema &&
      !responseValidator.validate(operation.responseSchema, payload)
    )
      throw new Error(
        `Response does not match its schema: ${responseValidator.errorsText()}`,
      );
    if (!pageConfig || count === 1) break;
    const rows = rowsOf(datasetOf(payload, config.responsePath));
    allRows.push(...rows);
    if (allRows.length > 5000)
      throw new Error("Pagination exceeds 5,000 rows. Request fewer pages.");
    if (!rows.length) break;
    if (pageConfig.mode === "next" || pageConfig.mode === "cursor") {
      const next = readPath(payload, pageConfig.nextPath);
      if (next === null || next === undefined || next === "") break;
      if (typeof next !== "string" && typeof next !== "number")
        throw new Error("The next-page field must be a URL or scalar cursor.");
      if (pageConfig.mode === "next") {
        const candidate = publicSourceUrl(new URL(String(next), target).href);
        if (candidate.origin !== canonical.origin)
          throw new Error(
            "Pagination cannot leave the configured source origin.",
          );
        current = candidate.href;
      } else {
        const candidate = new URL(url);
        candidate.searchParams.set(
          pageConfig.parameter ?? "cursor",
          String(next),
        );
        current = candidate.href;
      }
    }
  }
  signal?.throwIfAborted();
  const result = normalize(
    payload,
    pages.length > 1
      ? {
          ...operation,
          extract: () => transformData(allRows, config.transforms ?? []),
        }
      : operation,
    api.id,
    mode,
  );
  result.id = stableId("data", { source: api.id, url, mode, payload: pages });
  result.metadata = {
    ...result.metadata,
    ...adapterMetadata,
    provenance: {
      url,
      attribution: config.attribution ?? api.name,
      license: config.license ?? "Not declared",
      retrievedAt: result.source.invokedAt,
      lastModified,
      transforms: config.transforms ?? [],
      pages: pages.length,
    },
    transport: { mode, cached: false, bytes, pages: pages.length },
  };
  const response = {
    result,
    rawResponse: pages.length > 1 ? { pages } : rawResponse,
    requestUrl: url,
    durationMs: Math.round(performance.now() - started),
  };
  if (mode === "live" && config.method === "GET") {
    await writeLocal(key, {
      response,
      expiresAt: Date.now() + (config.refreshSeconds ?? 300) * 1000,
      savedAt: Date.now(),
    });
    void pruneLocal("cache:", 40);
  }
  return response;
}
