import type { Row, PresentationSpec } from "../types";
import { readPath } from "./fields";
export function mappedPriceRow(row: Row, presentation: PresentationSpec) {
  return {
    ...row,
    ...(presentation.xField
      ? { time: readPath(row, presentation.xField) }
      : {}),
    ...(presentation.yField
      ? { close: readPath(row, presentation.yField) }
      : {}),
  };
}
const num = (v: unknown) =>
  v === null || v === undefined || String(v).trim() === ""
    ? undefined
    : Number.isFinite(Number(v))
      ? Number(v)
      : undefined;
function first(row: Row, keys: string[]) {
  return keys.map((k) => row[k]).find((v) => v !== undefined);
}
export function pricePoint(row: Row) {
  const rawTime = first(row, ["time", "date", "datetime", "timestamp", "Date"]);
  const parsed =
    typeof rawTime === "number"
      ? new Date(rawTime < 1e12 ? rawTime * 1000 : rawTime)
      : new Date(
          typeof rawTime === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(rawTime)
            ? rawTime
            : "",
        );
  const time =
    Number.isFinite(parsed.getTime()) &&
    !(
      typeof rawTime === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(rawTime) &&
      parsed.toISOString().slice(0, 10) !== rawTime
    )
      ? parsed.toISOString()
      : undefined;
  const open = num(first(row, ["open", "Open", "1. open"])),
    high = num(first(row, ["high", "High", "2. high"])),
    low = num(first(row, ["low", "Low", "3. low"])),
    close = num(first(row, ["close", "Close", "4. close", "price", "value"]));
  const volume = num(first(row, ["volume", "Volume", "5. volume"]));
  const ohlc =
    [open, high, low, close].every((v) => v !== undefined) &&
    low! <= Math.min(open!, close!) &&
    high! >= Math.max(open!, close!) &&
    low! <= high!;
  return {
    time,
    open,
    high,
    low,
    close,
    volume: volume !== undefined && volume >= 0 ? volume : undefined,
    ohlc,
    symbol: String(row.symbol ?? row.ticker ?? "Price series"),
    currency: /^[A-Z]{3}$/.test(String(row.currency))
      ? String(row.currency)
      : "",
  };
}
