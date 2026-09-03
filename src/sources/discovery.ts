import { DOMParser } from "linkedom";
import { searchCapabilities } from "../api/capabilities";
import { normalize } from "../runtime/normalize";
import { compileCustomApi } from "../api/custom";
import { detectFormat, decodeSource } from "./adapters";
import { readPublicResponse, checkPagePermission } from "./fetch";
import { publicSourceUrl, stableId } from "./security";
import { normalizeError } from "../runtime/errors";
import type { CustomApiConfig, SourceFormat, InputDefinition } from "../types";

export interface SourceCandidate {
  id: string;
  title: string;
  url: string;
  format: SourceFormat;
  score: number;
  reasons: string[];
  authentication: "none" | "required" | "unknown";
  access: "verified" | "not-tested" | "blocked";
  license: string;
  retrievedAt?: string;
  configuration?: CustomApiConfig;
}
export function sourceConfiguration(
  url: string,
  options: {
    name?: string;
    format?: SourceFormat;
    selector?: string;
    permitted?: boolean;
    sampleResponse?: unknown;
  } = {},
): CustomApiConfig {
  const parsed = publicSourceUrl(url);
  parsed.hash = "";
  const query = Object.fromEntries(parsed.searchParams);
  const endpoint = parsed.pathname;
  return {
    id: stableId("custom", {
      url: parsed.href,
      format: options.format ?? "auto",
      selector: options.selector ?? "",
    }),
    name: options.name ?? `${parsed.hostname}${parsed.pathname}`.slice(0, 120),
    baseUrl: parsed.origin,
    endpoint,
    method: "GET",
    query,
    format: options.format ?? "auto",
    selector: options.selector,
    permitted: options.permitted,
    sampleResponse: options.sampleResponse ?? [],
    refreshSeconds: 300,
  };
}
const safeLinks = (
  values: { title?: string; url: string; format?: SourceFormat }[],
) =>
  values
    .flatMap((value) => {
      try {
        const url = publicSourceUrl(value.url).href;
        return [
          {
            id: stableId("candidate", url),
            title: (value.title ?? url).slice(0, 120),
            url,
            format: value.format ?? "auto",
            score: 30,
            reasons: ["Linked by the inspected source. Inspect before adding."],
            authentication: "unknown" as const,
            access: "not-tested" as const,
            license: "Not declared",
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, 30);
function documentationCandidates(raw: any, url: string) {
  const ref = (value: any) =>
    value?.$ref?.startsWith("#/")
      ? value.$ref
          .slice(2)
          .split("/")
          .reduce(
            (v: any, k: string) =>
              v?.[k.replace(/~1/g, "/").replace(/~0/g, "~")],
            raw,
          )
      : value;
  const candidates: SourceCandidate[] = [];
  if (raw.openapi || raw.swagger) {
    const base = new URL(
      raw.servers?.[0]?.url ??
        (raw.host
          ? `${raw.schemes?.[0] ?? "https"}://${raw.host}${raw.basePath ?? ""}`
          : "."),
      url,
    );
    for (const [path, entry] of Object.entries(raw.paths ?? {}).slice(
      0,
      100,
    ) as [string, any][]) {
      const op = entry.get;
      if (!op) continue;
      const endpoint = new URL(base.href.replace(/\/$/, "") + path);
      const config = sourceConfiguration(endpoint.href, {
        name: op.summary ?? op.operationId ?? path,
        format: "json",
      });
      const inputs: Record<string, InputDefinition> = {},
        query: Record<string, string> = {};
      for (const value of [
        ...(entry.parameters ?? []),
        ...(op.parameters ?? []),
      ].slice(0, 20)) {
        const p = ref(value),
          schema = ref(p?.schema) ?? p;
        if (
          !p ||
          !["path", "query"].includes(p.in) ||
          !/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(p.name)
        )
          continue;
        inputs[p.name] = {
          type: ["number", "integer"].includes(schema.type)
            ? schema.type
            : schema.format === "date"
              ? "date"
              : "string",
          label: p.description?.slice(0, 120) ?? p.name,
          required: p.required,
          ...(schema.default !== undefined ? { default: schema.default } : {}),
        };
        if (p.in === "query") query[p.name] = `{${p.name}}`;
      }
      config.inputs = inputs;
      config.query = query;
      config.license = raw.info?.license?.name ?? "Not declared";
      config.attribution = raw.info?.title;
      const requires = (op.security ?? raw.security ?? []).length > 0;
      config.authentication = requires ? "api-key" : "none";
      try {
        compileCustomApi(config);
      } catch {
        continue;
      }
      candidates.push({
        id: config.id,
        title: config.name,
        url: endpoint.href,
        format: "json",
        score: 65,
        reasons: [
          "GET operation declared in OpenAPI documentation.",
          ...(requires
            ? [
                "Authentication is declared. This client does not store credentials.",
              ]
            : []),
        ],
        authentication: requires ? "required" : "none",
        access: "not-tested",
        license: config.license!,
        configuration: config,
      });
    }
  }
  return candidates.slice(0, 20);
}
export async function inspectSource(
  url: string,
  options: {
    format?: SourceFormat;
    selector?: string;
    permitted?: boolean;
    introspectGraphql?: boolean;
  } = {},
  signal?: AbortSignal,
) {
  publicSourceUrl(url);
  const timeout = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
    : AbortSignal.timeout(20000);
  let target = url;
  if (options.introspectGraphql) {
    const u = new URL(url);
    u.searchParams.set(
      "query",
      "query { __schema { queryType { name } types { kind name fields { name } } } }",
    );
    target = u.href;
  }
  try {
    const response = await readPublicResponse(target, {}, timeout);
    const format =
      options.format && options.format !== "auto"
        ? options.format
        : detectFormat(response.text, response.contentType, url);
    const html =
      /^\s*(?:<!doctype html|<html)/i.test(response.text) ||
      /text\/html/i.test(response.contentType);
    if (html) await checkPagePermission(url, options.permitted, timeout);
    const parsed = decodeSource(response.text, {
      url,
      format,
      contentType: response.contentType,
      selector: options.selector,
      permitted: options.permitted,
    });
    const configuration = sourceConfiguration(url, {
      format,
      selector: options.selector,
      permitted: options.permitted,
      name: String(parsed.metadata.title || new URL(url).hostname),
      sampleResponse:
        JSON.stringify(parsed.raw).length <= 200000 ? parsed.raw : [],
    });
    const compiled = compileCustomApi(configuration);
    const result = normalize(
      parsed.value,
      compiled.api.operations[0],
      configuration.id,
      "live",
    );
    const documentation =
      format === "openapi" ||
      (parsed.value as any)?.$schema ||
      (parsed.value as any)?.__schema;
    const candidates = documentationCandidates(parsed.raw, url);
    if (html) {
      const doc = new DOMParser().parseFromString(
        response.text,
        "text/html",
      ) as unknown as Document;
      candidates.push(
        ...safeLinks(
          Array.from(doc.querySelectorAll("a[href],link[href]"))
            .filter((a) =>
              /\.(json|csv|xml|rss|ya?ml)(\?|$)|openapi|swagger|\/api\//i.test(
                a.getAttribute("href") ?? "",
              ),
            )
            .map((a) => ({
              url: new URL(a.getAttribute("href")!, url).href,
              title: a.textContent ?? undefined,
            })),
        ),
      );
    }
    const resources =
      (parsed.raw as any)?.result?.resources ??
      (parsed.raw as any)?.result?.results?.flatMap(
        (r: any) => r.resources ?? [],
      ) ??
      [];
    candidates.push(
      ...safeLinks(
        resources
          .filter((r: any) => r.url)
          .map((r: any) => ({ url: r.url, title: r.name })),
      ),
    );
    return {
      status: "ready" as const,
      id: configuration.id,
      url,
      format,
      kind: documentation ? "documentation" : "data",
      retrievedAt: new Date().toISOString(),
      contentType: response.contentType,
      bytes: response.bytes,
      fields: result.fields,
      structure: result.structure,
      sample: Array.isArray(result.data)
        ? result.data.slice(0, 5)
        : result.data,
      candidates: candidates.slice(0, 30),
      configuration: documentation ? undefined : configuration,
      metadata: parsed.metadata,
      warnings: [
        ...(documentation
          ? [
              "This is a schema or documentation document. Choose a declared data operation.",
            ]
          : []),
        "Licensing and permitted reuse must be reviewed at the source.",
      ],
      pagination: {
        suggested:
          format === "socrata"
            ? {
                mode: "offset",
                parameter: "$offset",
                sizeParameter: "$limit",
                size: 100,
                maxPages: 1,
              }
            : format === "arcgis"
              ? {
                  mode: "offset",
                  parameter: "resultOffset",
                  sizeParameter: "resultRecordCount",
                  size: 100,
                  maxPages: 1,
                }
              : format === "ckan"
                ? {
                    mode: "offset",
                    parameter: "offset",
                    sizeParameter: "limit",
                    size: 100,
                    maxPages: 1,
                  }
                : null,
      },
    };
  } catch (error) {
    return {
      status: "blocked" as const,
      id: stableId("candidate", url),
      url,
      error: normalizeError(error),
      warnings: [
        "No data was invented. Browser access, source permission or an approved server adapter may be required.",
      ],
      candidates: [],
    };
  }
}
let directoryCache: { value: any; at: number } | undefined;
export function rankCandidates(query: string, candidates: SourceCandidate[]) {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !["the", "for", "and", "find", "data", "api", "show"].includes(w),
    );
  return candidates
    .map((candidate) => {
      const haystack =
        `${candidate.title} ${candidate.url} ${candidate.reasons.join(" ")}`.toLowerCase();
      const relevance = words.filter((w) => haystack.includes(w)).length;
      return {
        ...candidate,
        score:
          relevance * 20 +
          (candidate.access === "verified" ? 15 : 0) +
          (candidate.authentication === "none" ? 5 : 0) +
          (candidate.license !== "Not declared" ? 3 : 0),
        reasons: [
          `${relevance} requested terms match this source.`,
          ...candidate.reasons,
        ],
      };
    })
    .filter((c) => !words.length || !c.reasons[0].startsWith("0 requested"))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
export async function discoverSources(
  query: string,
  options: {
    urls?: string[];
    publicCatalog?: boolean;
    permitted?: boolean;
  } = {},
  signal?: AbortSignal,
) {
  if (query.length > 1500)
    throw new Error("Keep discovery requests under 1,500 characters.");
  const warnings: string[] = [],
    candidates: SourceCandidate[] = searchCapabilities(query, {
      noAuthOnly: false,
    }).map((m) => ({
      id: stableId("candidate", m.sourceId + "/" + m.capabilityId),
      title: m.title,
      url: m.request.endpoint,
      format: "json",
      score: m.score,
      reasons: [m.description, "Already registered in this workspace catalog."],
      authentication: m.authentication === "none" ? "none" : "required",
      access: "not-tested",
      license: "Not declared",
    }));
  const urls =
    options.urls ?? (/^https:\/\//.test(query.trim()) ? [query.trim()] : []);
  if (urls.length > 5)
    throw new Error("Inspect up to five supplied URLs at once.");
  for (const url of urls) {
    const inspection = await inspectSource(
      url,
      { permitted: options.permitted },
      signal,
    );
    if (inspection.status === "ready") {
      candidates.push(...inspection.candidates);
      if (inspection.configuration)
        candidates.push({
          id: inspection.id,
          title: inspection.configuration.name,
          url,
          format: inspection.format,
          score: 100,
          reasons: ["Response parsed and inferred in this browser."],
          authentication: "none",
          access: "verified",
          license: String(inspection.metadata.license ?? "Not declared"),
          retrievedAt: inspection.retrievedAt,
          configuration: inspection.configuration,
        });
    } else warnings.push(`${url}: ${inspection.error.message}`);
  }
  if (options.publicCatalog !== false && !urls.length) {
    try {
      if (!directoryCache || Date.now() - directoryCache.at > 3600000) {
        const response = await readPublicResponse(
          "https://api.apis.guru/v2/list.json",
          {},
          signal,
          12_000_000,
        );
        directoryCache = { value: JSON.parse(response.text), at: Date.now() };
      }
      for (const [key, value] of Object.entries(directoryCache.value) as [
        string,
        any,
      ][]) {
        const info = value.versions?.[value.preferred],
          title = info?.info?.title ?? key;
        if (
          !query
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 3)
            .some((w) =>
              `${key} ${title} ${info?.info?.description ?? ""}`
                .toLowerCase()
                .includes(w),
            )
        )
          continue;
        if (info?.swaggerUrl)
          candidates.push({
            id: stableId("candidate", info.swaggerUrl),
            title,
            url: info.swaggerUrl,
            format: "openapi",
            score: 0,
            reasons: [
              "Discovered in the public APIs.guru directory.",
              String(info.info?.description ?? "")
                .replace(/<[^>]*>/g, "")
                .slice(0, 240),
            ],
            authentication: "unknown",
            access: "not-tested",
            license: info.info?.license?.name ?? "Not declared",
          });
      }
    } catch (error) {
      warnings.push(
        `Public API directory unavailable: ${normalizeError(error).message}`,
      );
    }
  }
  return {
    query,
    candidates: rankCandidates(query, candidates),
    warnings,
    scope:
      "Current catalog, the public APIs.guru directory and supplied URLs. This is not an unrestricted web crawler.",
    retrievedAt: new Date().toISOString(),
  };
}
