import Ajv from "ajv";
import type { BlockStyle } from "../types";
const color = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
export const blockStyleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    background: color,
    color,
    borderColor: color,
    fontSize: { type: "integer", minimum: 12, maximum: 28 },
    textAlign: { enum: ["left", "center", "right"] },
  },
};
const check = new Ajv().compile(blockStyleSchema);
export function validateBlockStyle(value: unknown) {
  if (value !== undefined && !check(value))
    throw new Error(
      "Use six-digit hex colors, a 12 to 28 px font, and left, center or right alignment.",
    );
}
export function blockStyle(value?: BlockStyle) {
  // Shared/imported state also goes through the allowlist before reaching CSS.
  if (!value || !check(value)) return {};
  return {
    backgroundColor: value.background,
    color: value.color,
    borderColor: value.borderColor,
    "--block-font-size": value.fontSize ? `${value.fontSize}px` : undefined,
    "--block-text-align": value.textAlign,
  };
}
