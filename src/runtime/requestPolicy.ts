let active = 0;
const waiting: (() => void)[] = [];
const providerNext = new Map<string, number>();
export async function requestSlot<T>(
  url: string,
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  if (active >= 4)
    await new Promise<void>((resolve, reject) => {
      const next = () => {
        signal.removeEventListener("abort", cancel);
        resolve();
      };
      const cancel = () => {
        const index = waiting.indexOf(next);
        if (index >= 0) waiting.splice(index, 1);
        reject(signal.reason);
      };
      waiting.push(next);
      signal.addEventListener("abort", cancel, { once: true });
    });
  else active++;
  try {
    signal.throwIfAborted();
    const host = new URL(url).hostname;
    const now = Date.now(),
      start = Math.max(now, providerNext.get(host) ?? 0);
    providerNext.set(host, start + 260);
    if (start > now)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", cancel);
          resolve();
        }, start - now);
        const cancel = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        signal.addEventListener("abort", cancel, { once: true });
      });
    signal.throwIfAborted();
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export function publicUrl(value: string) {
  const url = new URL(value),
    host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "::" ||
    host.includes(":") ||
    /^127\.|^10\.|^0\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(
      host,
    )
  )
    throw new Error(
      "Custom sources require a public HTTPS URL without credentials or private network addresses.",
    );
  return url;
}
