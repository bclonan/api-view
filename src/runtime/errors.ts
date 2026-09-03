import type { NormalizedError } from "../types";
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
