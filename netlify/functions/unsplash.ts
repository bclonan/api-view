// Only this server function reads the key. Never add it to a VITE_* variable.
declare const Netlify: { env: { get(name: string): string | undefined } };

export const config = {
  method: ["GET"],
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const failure = (
  status: number,
  code: string,
  title: string,
  message: string,
  headers?: Record<string, string>,
) => json({ error: { code, title, message } }, status, headers);

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET")
    return failure(
      405,
      "method-not-allowed",
      "Use a read-only request",
      "This endpoint only accepts GET photo searches.",
      { Allow: "GET" },
    );
  const params = new URL(request.url).searchParams;
  const allowed = new Set(["query", "page", "per_page", "orientation"]);
  if (
    [...params.keys()].some(
      (key) => !allowed.has(key) || params.getAll(key).length !== 1,
    )
  )
    return failure(
      400,
      "invalid-input",
      "Invalid search inputs",
      "Use query, page, per_page and optional orientation. URLs, credentials and extra parameters are not accepted.",
    );
  const query = params.get("query")?.trim(),
    page = params.get("page") ?? "1",
    count = params.get("per_page") ?? "6",
    orientation = params.get("orientation");
  if (
    !query ||
    query.length > 500 ||
    !/^\d+$/.test(page) ||
    +page < 1 ||
    +page > 100 ||
    !/^\d+$/.test(count) ||
    +count < 1 ||
    +count > 20 ||
    (orientation &&
      !["landscape", "portrait", "squarish"].includes(orientation))
  )
    return failure(
      400,
      "invalid-input",
      "Check the photo search",
      "Provide a subject, page 1–100, 1–20 results and a supported orientation.",
    );
  const key =
    typeof Netlify === "undefined"
      ? undefined
      : Netlify.env.get("UNSPLASH_ACCESS_KEY");
  if (!key)
    return failure(
      503,
      "authentication-required",
      "Unsplash needs an Access Key",
      "Add UNSPLASH_ACCESS_KEY to the site's Netlify environment variables with Functions scope, then redeploy. Create an application at https://unsplash.com/oauth/applications. A Secret Key is not needed.",
    );
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("page", page);
  url.searchParams.set("per_page", count);
  url.searchParams.set("content_filter", "high");
  if (orientation) url.searchParams.set("orientation", orientation);
  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Client-ID ${key}`,
        "Accept-Version": "v1",
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    if ([401, 403].includes(upstream.status))
      return failure(
        upstream.status,
        "authentication-required",
        "Unsplash rejected the Access Key",
        "Check the application's Access Key and API permissions in Unsplash, update UNSPLASH_ACCESS_KEY in Netlify, then redeploy.",
      );
    if (upstream.status === 429)
      return failure(
        429,
        "429",
        "Unsplash request limit reached",
        "Wait for the Unsplash hourly quota to reset. Demo applications allow 50 requests per hour.",
        {
          "Retry-After": /^\d+$/.test(upstream.headers.get("Retry-After") ?? "")
            ? upstream.headers.get("Retry-After")!
            : "3600",
        },
      );
    if (!upstream.ok)
      return failure(
        upstream.status,
        String(upstream.status),
        "Unsplash returned an error",
        `Unsplash returned HTTP ${upstream.status}. Retry later or use another image source.`,
      );
    if (Number(upstream.headers.get("Content-Length")) > 2_000_000)
      throw new Error("size");
    const reader = upstream.body?.getReader();
    if (!reader) throw new Error("body");
    let body = "",
      size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 2_000_000) {
          await reader.cancel();
          throw new Error("size");
        }
        body += decoder.decode(next.value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const data = JSON.parse(body);
    if (!Array.isArray(data.results)) throw new Error("schema");
    return json(data);
  } catch (error) {
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      return failure(
        504,
        "timeout",
        "Unsplash took too long",
        "The photo request timed out or was cancelled. Retry the search.",
      );
    return failure(
      502,
      "upstream-unavailable",
      "Unsplash is unavailable",
      "The server could not read a valid Unsplash response. Retry later or choose Wikimedia Commons, NASA Images or the Met collection.",
    );
  }
}
