import type { SemanticValueType } from "../types";
export function detectValue({
  key = "",
  value,
}: {
  key?: string;
  value: unknown;
}): { type: SemanticValueType; confidence: number } {
  const name = key.toLowerCase();
  const result = (type: SemanticValueType, confidence = 0.95) => ({
    type,
    confidence,
  });
  if (value === null || value === undefined || value === "")
    return result("unknown", 0);
  if (typeof value === "boolean") return result("boolean", 1);
  if (typeof value === "object") {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      /coordinates?|position|location/.test(name) &&
      value.every((v) => typeof v === "number")
    )
      return result("coordinate", 0.75);
    return result(Array.isArray(value) ? "array" : "object", 1);
  }
  const text = String(value);
  if (/^-?\d+(?:\.\d+)?\s*%$/.test(text)) return result("percent", 0.99);
  if (/^[$€£]\s*-?[\d,.]+$/.test(text)) return result("currency", 0.99);
  if (
    /^-?\d+(?:\.\d+)?\s*(kg|km|km\/h|m\/s|cm|mm|m|g|mg|°[CF]|kWh|W|Hz)$/i.test(
      text,
    )
  )
    return result("measurement", 0.9);
  if (/(^id$|_id$|^key$|^zip|postal|^code$)/.test(name))
    return result("identifier");
  if (/^https?:\/\//i.test(text)) {
    if (
      /(image|thumbnail|cover|photo|avatar)/.test(name) ||
      /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(text)
    )
      return result("image", 0.99);
    if (/(audio|mp3)/.test(name) || /\.(mp3|wav|ogg)(\?|$)/i.test(text))
      return result("audio");
    if (/(video)/.test(name) || /\.(mp4|webm)(\?|$)/i.test(text))
      return result("video");
    return result("url", 0.99);
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return result("email");
  if (
    /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(text) &&
    Number.isFinite(Date.parse(text))
  )
    return result(text.includes("T") ? "datetime" : "date", 0.99);
  if (/^P(?:\d+[YMWD])*(?:T[\dHMS.]+)?$/.test(text))
    return result("duration", 0.8);
  if (typeof value === "number" || /^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return result("unknown", 0);
    if (
      /(^time$|timestamp|_at$)/.test(name) &&
      n >= 1000000000 &&
      n <= 9999999999999
    )
      return result("datetime", 0.9);
    if (/^(lat|latitude)$/.test(name) && Math.abs(n) <= 90)
      return result("latitude", 0.99);
    if (/^(lng|lon|longitude)$/.test(name) && Math.abs(n) <= 180)
      return result("longitude", 0.99);
    if (
      /(price|cost|debt|revenue|market_value|amount|_amt$|balance)/.test(name)
    )
      return result("currency", 0.84);
    if (/(percent|percentage|pct)/.test(name)) return result("percent", 0.9);
    if (/(duration|elapsed|seconds)/.test(name)) return result("duration", 0.8);
    return result(Number.isInteger(n) ? "integer" : "number", 1);
  }
  if (/(status|category|type|language)/.test(name))
    return result("category", 0.8);
  return result("text", 0.9);
}
export const labelFor = (key: string) =>
  ({
    tot_pub_debt_out_amt: "Total public debt",
    debt_held_public_amt: "Debt held by public",
    record_date: "Date",
    temperature_2m: "Temperature",
    relative_humidity_2m: "Humidity",
    wind_speed_10m: "Wind speed",
  })[key] ?? key.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase());
