import { ApiFailure } from "./errors";
export { ApiFailure, normalizeError } from "./errors";
import { executeSource } from "../sources/execute";
import { getOperation } from "../api/registry";
import { normalize } from "./normalize";
import { readLocal, writeLocal, pruneLocal } from "./persistence";
import { readPath } from "./fields";
import { requestSlot } from "./requestPolicy";
import type {
  Row,
  DataMode,
  ApiDefinition,
  Operation,
} from "../types";
import Ajv from "ajv";
const responseValidator = new Ajv({ strict: false, allowUnionTypes: true });
export function validateArguments(
  apiId: string,
  operationId: string,
  provided: Row,
) {
  const { operation } = getOperation(apiId, operationId);
  return validateOperationArguments(operation, provided);
}
export function validateOperationArguments(
  operation: Operation,
  provided: Row,
) {
  const args: Row = {};
  const missing: string[] = [];
  for (const key of Object.keys(provided))
    if (!Object.hasOwn(operation.inputs, key))
      throw new Error(`Unknown input: ${key}`);
  for (const [key, field] of Object.entries(operation.inputs)) {
    const value = provided[key] ?? field.default;
    if (value === "" || value === undefined || value === null) {
      if (field.required) missing.push(key);
      continue;
    }
    if (field.type === "number" || field.type === "integer") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (field.type === "integer" && !Number.isInteger(value))
      )
        throw new Error(`${field.label} must be a valid ${field.type}.`);
      if (
        (field.minimum !== undefined && value < field.minimum) ||
        (field.maximum !== undefined && value > field.maximum)
      )
        throw new Error(
          `${field.label} must be between ${field.minimum} and ${field.maximum}.`,
        );
    } else {
      if (typeof value !== "string" || value.length > 500)
        throw new Error(`${field.label} must be text, up to 500 characters.`);
      if (
        field.type === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        throw new Error(`${field.label} must be a valid date.`);
    }
    args[key] = value;
    if (field.enum && !field.enum.includes(String(value)))
      throw new Error(
        `${field.label} must be one of: ${field.enum.join(", ")}.`,
      );
  }
  if (args.from && args.to && String(args.from) > String(args.to))
    throw new Error("From date must be before the to date.");
  if (
    args.starttime &&
    args.endtime &&
    String(args.starttime) > String(args.endtime)
  )
    throw new Error("Start date must be before end date.");
  if (
    args.minmagnitude !== undefined &&
    args.maxmagnitude !== undefined &&
    Number(args.minmagnitude) > Number(args.maxmagnitude)
  )
    throw new Error("Minimum magnitude must not exceed maximum magnitude.");
  if (
    args.maxradiuskm !== undefined &&
    (args.latitude === undefined || args.longitude === undefined)
  )
    throw new Error("Radius searches need latitude and longitude.");
  return { args, missing };
}
export async function invoke(
  apiId: string,
  operationId: string,
  provided: Row,
  mode: DataMode,
  signal?: AbortSignal,
  fresh = false,
) {
  const { api, operation } = getOperation(apiId, operationId);
  return invokeOperation(api, operation, provided, mode, signal, fresh);
}
export async function invokeOperation(
  api: ApiDefinition,
  operation: Operation,
  provided: Row,
  mode: DataMode,
  signal?: AbortSignal,
  fresh = false,
) {
  if (mode === "live" && api.liveNotice)
    throw new ApiFailure({
      code: "authentication-required",
      title: "This source requires an API key",
      message: api.liveNotice,
    });
  const { args, missing } = validateOperationArguments(operation, provided);
  if (missing.length) throw new Error(`Missing inputs: ${missing.join(", ")}`);
  signal?.throwIfAborted();
  if (operation.sourceConfig) return executeSource(api, operation, args, mode, signal, fresh);
  const requestUrl = operation.buildUrl(args);
  const started = performance.now();
  let rawResponse: unknown;
  let expandedResponse: unknown;
  const options = operation.buildRequest?.(args) ?? {};
  const canonical = new URL(requestUrl);
  canonical.searchParams.sort();
  const cacheKey = `cache:${api.id}/${operation.id}:${canonical.href}:${JSON.stringify(options)}`;
  let transport: Row = { mode };
  const cacheable =
    mode === "live" &&
    (operation.method ?? "GET") === "GET" &&
    !!operation.cacheTtlMs;
  const cached =
    cacheable && !fresh
      ? await readLocal<{
          rawResponse: unknown;
          expiresAt: number;
          fetchedAt: string;
          transport: Row;
          expandedResponse?: unknown;
        }>(cacheKey)
      : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    signal?.throwIfAborted();
    const result = normalize(
      cached.expandedResponse ?? cached.rawResponse,
      operation,
      api.id,
      mode,
    );
    result.source.invokedAt = cached.fetchedAt;
    result.metadata.transport = { ...cached.transport, cached: true };
    return {
      rawResponse: cached.rawResponse,
      result,
      requestUrl,
      durationMs: 0,
    };
  }
  if (mode === "sample") rawResponse = operation.sample(args);
  else {
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000);
    const load = async (url: string) =>
      requestSlot(url, requestSignal, async () => {
        const response = await fetch(url, {
          signal: requestSignal,
          method: operation.method ?? "GET",
          headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
          ...(options.body ? { body: options.body } : {}),
          credentials: "omit",
          referrerPolicy: "no-referrer",
          redirect: api.id.startsWith("custom-") ? "error" : "follow",
        });
        if (!response.ok) {
          const retry = response.headers.get("Retry-After");
          const retryAfter = retry
            ? /^\d+$/.test(retry)
              ? Number(retry)
              : Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
            : undefined;
          throw new ApiFailure({
            code: String(response.status),
            title:
              response.status === 429
                ? "Request limit reached"
                : "The source returned an error",
            message: `HTTP ${response.status}. ${response.status === 429 ? "Wait before retrying." : "Check the inputs or try another source."}`,
            ...(Number.isFinite(retryAfter) ? { retryAfter } : {}),
          });
        }
        if (Number(response.headers.get("Content-Length")) > 5_000_000)
          throw new Error("Response is too large. Request fewer results.");
        let body = "";
        let bytes = 0;
        if (response.body) {
          const reader = response.body.getReader(),
            decoder = new TextDecoder();
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > 5_000_000) {
                await reader.cancel();
                throw new Error(
                  "Response is too large. Request fewer results.",
                );
              }
              body += decoder.decode(chunk.value, { stream: true });
            }
            body += decoder.decode();
          } finally {
            reader.releaseLock();
          }
        } else {
          body = await response.text();
          bytes = new TextEncoder().encode(body).length;
        }
        if (bytes > 5_000_000)
          throw new Error("Response is too large. Request fewer results.");
        transport = {
          status: response.status,
          contentType: response.headers.get("Content-Type"),
          bytes,
          cached: false,
        };
        try {
          return JSON.parse(body);
        } catch {
          throw new Error("The source did not return valid JSON.");
        }
      });
    rawResponse = await load(requestUrl);
    if (operation.expand) {
      const expansion = operation.expand,
        ids = readPath(rawResponse, expansion.path);
      if (!Array.isArray(ids))
        throw new Error(
          "Expected a list of record IDs. The response schema changed.",
        );
      const selected = ids.slice(
        0,
        Math.min(expansion.max, Number(args[expansion.parameter]) || 20),
      );
      const records: unknown[] = [];
      for (let i = 0; i < selected.length; i += 4) {
        requestSignal.throwIfAborted();
        records.push(
          ...(await Promise.all(
            selected
              .slice(i, i + 4)
              .map((value) =>
                load(
                  expansion.url.replace(
                    "{id}",
                    encodeURIComponent(String(value)),
                  ),
                ),
              ),
          )),
        );
      }
      expandedResponse = records.filter(Boolean);
      transport.expandedRecords = records.length;
    }
  }
  signal?.throwIfAborted();
  if (
    operation.responseSchema &&
    !responseValidator.validate(operation.responseSchema, rawResponse)
  )
    throw new Error(
      `Response does not match its schema: ${responseValidator.errorsText()}`,
    );
  const result = normalize(
    expandedResponse ?? rawResponse,
    operation,
    api.id,
    mode,
  );
  result.metadata.transport = transport;
  if (cacheable) {
    await writeLocal(cacheKey, {
      rawResponse,
      ...(expandedResponse ? { expandedResponse } : {}),
      transport,
      fetchedAt: result.source.invokedAt,
      expiresAt: Date.now() + operation.cacheTtlMs!,
      savedAt: Date.now(),
    });
    void pruneLocal("cache:", 40);
  }
  return {
    rawResponse,
    result,
    requestUrl,
    durationMs: Math.round(performance.now() - started),
  };
}
