import { getOperation } from "../api/registry";
import { normalize } from "./normalize";
import type { Row, DataMode, NormalizedError } from "../types";
export function validateArguments(
  apiId: string,
  operationId: string,
  provided: Row,
) {
  const { operation } = getOperation(apiId, operationId);
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
  }
  if (args.from && args.to && String(args.from) > String(args.to))
    throw new Error("From date must be before the to date.");
  return { args, missing };
}
export class ApiFailure extends Error {
  constructor(public detail: NormalizedError) {
    super(detail.message);
  }
}
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof ApiFailure) return error.detail;
  if (error instanceof DOMException && error.name === "AbortError")
    return {
      code: "cancelled",
      title: "Request cancelled",
      message: "The request was cancelled. You can retry when ready.",
    };
  if (error instanceof DOMException && error.name === "TimeoutError")
    return {
      code: "timeout",
      title: "The source took too long",
      message: "The request timed out after 20 seconds. Try again.",
    };
  if (error instanceof TypeError)
    return {
      code: "network",
      title: "Browser request unavailable",
      message:
        "The network request failed. The source may be offline or may not allow browser access. Check your connection, retry, or choose sample data.",
    };
  return {
    code: "invalid",
    title: "Unable to load this widget",
    message:
      error instanceof Error
        ? error.message
        : "Unexpected response from the source.",
  };
}
export async function invoke(
  apiId: string,
  operationId: string,
  provided: Row,
  mode: DataMode,
  signal?: AbortSignal,
) {
  const { api, operation } = getOperation(apiId, operationId);
  if (mode === "live" && api.liveNotice)
    throw new ApiFailure({
      code: "authentication-required",
      title: "This source requires an API key",
      message: api.liveNotice,
    });
  const { args, missing } = validateArguments(apiId, operationId, provided);
  if (missing.length) throw new Error(`Missing inputs: ${missing.join(", ")}`);
  signal?.throwIfAborted();
  const requestUrl = operation.buildUrl(args);
  const started = performance.now();
  let rawResponse: unknown;
  if (mode === "sample") rawResponse = operation.sample(args);
  else {
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000);
    const response = await fetch(requestUrl, {
      signal: requestSignal,
      headers: { Accept: "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
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
    const body = await response.text();
    if (body.length > 5_000_000)
      throw new Error("Response is too large. Request fewer results.");
    try {
      rawResponse = JSON.parse(body);
    } catch {
      throw new Error("The source did not return valid JSON.");
    }
  }
  signal?.throwIfAborted();
  return {
    rawResponse,
    result: normalize(rawResponse, operation, apiId, mode),
    requestUrl,
    durationMs: Math.round(performance.now() - started),
  };
}
