import { presentations } from "../types";
import { blockStyleSchema } from "./blockStyle";
const path = { type: "string", maxLength: 500 };
const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", properties, required, additionalProperties: false });
export const presentation = object(
  {
    type: { enum: [...presentations] },
    xField: path,
    yField: path,
    fields: { type: "array", items: path, maxItems: 30 },
    series: { type: "array", items: path, maxItems: 4 },
    props: object({
      style: blockStyleSchema,
      filter: { type: "string", maxLength: 500 },
      sort: { type: "string", maxLength: 500 },
      sortDirection: { enum: ["asc", "desc"] },
      compact: { type: "boolean" },
      showSource: { type: "boolean" },
      numberFormat: { enum: ["compact", "standard"] },
      stockStyle: { enum: ["candles", "line"] },
      stockSymbol: { type: "string", maxLength: 120 },
    }),
  },
  ["type"],
);
