import { shallowRef } from "vue";
import { redactPublic } from "../sources/security";
// Session-only diagnostics. Do not put answer context or file data in the persisted action log.
export const latestToolResult = shallowRef<{
  tool: string;
  time: string;
  result: unknown;
}>();
export function recordToolResult(tool: string, output: unknown) {
  let remaining = 24000;
  const bounded = (value: unknown, depth = 0): unknown => {
    if (remaining <= 0 || depth > 7) return "[truncated]";
    remaining -= 50;
    if (typeof value === "string") {
      const result = value.slice(0, Math.max(0, Math.min(remaining, 1500)));
      remaining -= result.length;
      return result.length < value.length ? result + " [truncated]" : result;
    }
    if (Array.isArray(value))
      return value.slice(0, 12).map((v) => bounded(v, depth + 1));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .slice(0, 30)
          .map(([key, v]) => [
            key,
            ["files", "file", "raw", "headers"].includes(key)
              ? "[omitted from inspector]"
              : bounded(v, depth + 1),
          ]),
      );
    return value;
  };
  latestToolResult.value = {
    tool,
    time: new Date().toISOString(),
    result: redactPublic(bounded(output)),
  };
}
