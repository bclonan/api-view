import { requestSlot } from "../runtime/requestPolicy";
import { ApiFailure } from "../runtime/errors";
import { publicSourceUrl } from "./security";
export async function readPublicResponse(
  url: string,
  options: RequestInit = {},
  signal: AbortSignal = AbortSignal.timeout(20000),
  maxBytes = 5_000_000,
) {
  publicSourceUrl(url);
  return requestSlot(url, signal, async () => {
    const response = await fetch(url, {
      ...options,
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    if (!response.ok) {
      const retry = response.headers.get("Retry-After");
      throw new ApiFailure({
        code: String(response.status),
        title:
          response.status === 429
            ? "Request limit reached"
            : "The source returned an error",
        message: `HTTP ${response.status}. ${response.status === 429 ? "Wait before retrying." : "Check the URL, inputs and source access rules."}`,
        ...(retry && /^\d+$/.test(retry) ? { retryAfter: Number(retry) } : {}),
      });
    }
    if (Number(response.headers.get("Content-Length")) > maxBytes)
      throw new Error(
        `Response exceeds ${maxBytes / 1_000_000} MB. Request a smaller dataset.`,
      );
    let text = "",
      bytes = 0;
    if (response.body) {
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            throw new Error(
              `Response exceeds ${maxBytes / 1_000_000} MB. Request fewer rows.`,
            );
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    } else {
      text = await response.text();
      bytes = new TextEncoder().encode(text).length;
      if (bytes > maxBytes)
        throw new Error(`Response exceeds ${maxBytes / 1_000_000} MB.`);
    }
    return {
      text,
      bytes,
      status: response.status,
      contentType: response.headers.get("Content-Type") ?? "",
      lastModified: response.headers.get("Last-Modified"),
      etag: response.headers.get("ETag"),
    };
  });
}
export function robotsAllows(text: string, path: string) {
  const groups: {
    agents: string[];
    rules: { allow: boolean; path: string }[];
  }[] = [];
  let group:
    { agents: string[]; rules: { allow: boolean; path: string }[] } | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(),
      split = line.indexOf(":");
    if (split < 0) continue;
    const key = line.slice(0, split).toLowerCase(),
      value = line.slice(split + 1).trim();
    if (key === "user-agent") {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ["allow", "disallow"].includes(key) && value)
      group.rules.push({ allow: key === "allow", path: value });
  }
  const specific = groups.filter((g) =>
    g.agents.some((a) => a === "api-canvas"),
  );
  const selected = specific.length
    ? specific
    : groups.filter((g) => g.agents.includes("*"));
  const matches = selected
    .flatMap((g) => g.rules)
    .filter((rule) => {
      const end = rule.path.endsWith("$");
      const expression = rule.path
        .replace(/\$$/, "")
        .split("*")
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp(`^${expression}${end ? "$" : ""}`).test(path);
    })
    .sort(
      (a, b) =>
        b.path.length - a.path.length || Number(b.allow) - Number(a.allow),
    );
  return matches[0]?.allow ?? true;
}
const robotsCache = new Map<string, { text: string; at: number }>();
export async function checkPagePermission(
  url: string,
  permitted: boolean | undefined,
  signal?: AbortSignal,
) {
  if (!permitted)
    throw new Error(
      "Confirm permission to extract this public webpage. The app will also check its access restrictions.",
    );
  const parsed = publicSourceUrl(url),
    cache = robotsCache.get(parsed.origin);
  let text = cache && Date.now() - cache.at < 600000 ? cache.text : undefined;
  if (text === undefined) {
    try {
      const response = await readPublicResponse(
        `${parsed.origin}/robots.txt`,
        {},
        signal,
      );
      text = response.text;
      robotsCache.set(parsed.origin, { text, at: Date.now() });
    } catch (error) {
      // RFC 9309 section 2.3.1.3 permits access when robots.txt is unavailable.
      // Authentication failures and rate limits still block extraction.
      if (
        error instanceof ApiFailure &&
        ["400", "404", "410"].includes(error.detail.code)
      )
        text = "";
      else
        throw new Error(
          "Could not verify this site's robots.txt rules. Use a documented API or a separately approved adapter.",
          { cause: error },
        );
    }
  }
  if (!robotsAllows(text, parsed.pathname + parsed.search))
    throw new Error(
      "This site's robots.txt disallows extraction of this page. Choose a permitted API or dataset.",
    );
}
