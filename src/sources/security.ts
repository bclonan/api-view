import { publicUrl } from "../runtime/requestPolicy";

export const secretKey =
  /(?:authorization|cookie|password|passwd|secret|credential|api[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|^token$|signature|x-amz-|x-goog-credential)/i;
const secretValue =
  /^(?:Bearer|Basic)\s+\S+|\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{15,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;
export function stableId(prefix: string, value: unknown) {
  const canonical = (v: any): string =>
    Array.isArray(v)
      ? `[${v.map(canonical).join(",")}]`
      : v && typeof v === "object"
        ? `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
            .join(",")}}`
        : (JSON.stringify(v) ?? "null");
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(canonical(value)))
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  return `${prefix}-${hash.toString(16).padStart(16, "0")}`;
}
export function publicSourceUrl(value: string) {
  const url = publicUrl(value);
  for (const [key, val] of url.searchParams)
    if (secretKey.test(key) || secretValue.test(val))
      throw new Error(
        "Keep credentials out of source URLs. This workspace only stores public request settings.",
      );
  return url;
}
export function assertPublicSettings(
  value: unknown,
  path = "settings",
  depth = 0,
): void {
  if (depth > 20) throw new Error("Settings are nested too deeply.");
  if (typeof value === "string") {
    if (secretValue.test(value))
      throw new Error(`Remove credentials from ${path}.`);
    if (/^https?:\/\//i.test(value)) publicSourceUrl(value);
  } else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      if (secretKey.test(key))
        throw new Error(
          `Do not store private field ${path}.${key}. Configure credentials outside this public workspace.`,
        );
      assertPublicSettings(item, `${path}.${key}`, depth + 1);
    }
}
export function redactPublic(
  value: unknown,
  warnings: string[] = [],
  depth = 0,
): any {
  if (depth > 30) throw new Error("Shared data is nested too deeply.");
  if (typeof value === "string") {
    if (secretValue.test(value)) {
      warnings.push("Removed a credential value.");
      return "[redacted]";
    }
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()])
          if (secretKey.test(key)) {
            url.searchParams.delete(key);
            warnings.push("Removed a private URL parameter.");
          }
        return url.href;
      } catch {
        return value;
      }
    }
    const scrubbed = value
      .replace(
        /(["']?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|password|authorization|cookie|secret)["']?\s*[:=]\s*)(["'])(.*?)\2/gi,
        "$1$2[redacted]$2",
      )
      .replace(
        /(<(?:password|token|secret|api[-_]?key)>)[^<]*(<\/[^>]+>)/gi,
        "$1[redacted]$2",
      );
    if (scrubbed !== value)
      warnings.push("Redacted credentials from a source text response.");
    return scrubbed;
  }
  if (Array.isArray(value))
    return value
      .filter((item) => {
        if (
          item &&
          typeof item === "object" &&
          typeof item.key === "string" &&
          secretKey.test(item.key)
        ) {
          warnings.push("Removed credential field metadata.");
          return false;
        }
        return true;
      })
      .map((item) => redactPublic(item, warnings, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => {
          if (
            secretKey.test(key) ||
            ["__proto__", "constructor", "prototype"].includes(key)
          ) {
            warnings.push(`Removed private field ${key}.`);
            return false;
          }
          return true;
        })
        .map(([key, item]) => [key, redactPublic(item, warnings, depth + 1)]),
    );
  return value;
}
