import { detectValue } from "./detectValue";
import type { SemanticField, SemanticValueType } from "../types";

export const quantitativeTypes = [
  "number",
  "integer",
  "currency",
  "percent",
  "measurement",
  "duration",
];
export const isMeasure = (field: SemanticField) =>
  quantitativeTypes.includes(field.type) &&
  !["identifier", "year", "npi", "isbn"].includes(field.semanticType ?? "");
export function semanticDescriptor(
  key: string,
  samples: unknown[],
  parent = "",
): Partial<SemanticField> {
  const values = samples.filter((v) => v != null && v !== "");
  const primitives = [
    ...new Set(
      values.map((v) =>
        Array.isArray(v)
          ? "array"
          : typeof v === "number"
            ? Number.isInteger(v)
              ? "integer"
              : "number"
            : typeof v,
      ),
    ),
  ];
  const primitiveType = !primitives.length
    ? "null"
    : primitives.every((t) => ["integer", "number"].includes(t))
      ? primitives.includes("number")
        ? "number"
        : "integer"
      : primitives.length === 1
        ? primitives[0]
        : "mixed";
  const detected = values.map((value) => detectValue({ key, value }));
  const counts = new Map<string, number>();
  detected.forEach((d) => counts.set(d.type, (counts.get(d.type) ?? 0) + 1));
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  const consensus = best ? best[1] / values.length : 0;
  const type = (
    detected.length &&
    detected.every((d) => ["number", "integer"].includes(d.type))
      ? detected.some((d) => d.type === "number")
        ? "number"
        : "integer"
      : consensus >= 0.7
        ? best?.[0]
        : "unknown"
  ) as SemanticValueType;
  const name = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  const numeric =
    values.length > 0 &&
    values.every(
      (v) => typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v)),
    );
  let semanticType: string = type ?? "unknown";
  const rules: [RegExp, string, boolean][] = [
    [/^(title|name|label|headline|brief_title)$/, "title", true],
    [/(description|summary|abstract|body|overview)/, "description", true],
    [/(^doi$)/, "doi", values.every((v) => /^10\.\d{4,9}\//.test(String(v)))],
    [
      /(isbn)/,
      "isbn",
      values.every((v) => /^(?:\d[ -]?){9,12}[\dX]$/i.test(String(v))),
    ],
    [/^npi$/, "npi", values.every((v) => /^\d{10}$/.test(String(v)))],
    [/(^id$|_id$|identifier|^code$)/, "identifier", true],
    [/^(year|publication_year)$/, "year", numeric],
    [/(temperature|apparent_temperature)/, "temperature", numeric],
    [/^(mag|magnitude)$/, "magnitude", numeric],
    [/(distance|depth|altitude|elevation)/, "distance", numeric],
    [/(speed|velocity)/, "speed", numeric],
    [/(percentage|percent|humidity|probability)/, "percentage", numeric],
    [/(price|cost|income|revenue|debt|amount)/, "money", numeric],
    [
      /(^currency$|currency_code)/,
      "currency",
      values.every((v) => /^[A-Z]{3}$/.test(String(v))),
    ],
    [/^(status|overall_status)$/, "status", true],
    [/rating/, "rating", numeric],
    [/(count|total|population|quantity|score)/, "quantity", numeric],
    [/^(unit|units)$/, "unit", true],
    [/^(author|authors|artist|artist_title|person|by)$/, "person", true],
    [/(publisher|organization|sponsor|institution)/, "organization", true],
    [/(postal|zip)/, "postalCode", true],
    [/^(city|town)$/, "city", true],
    [/^(state|state_province|region)$/, "state", true],
    [/country/, "country", true],
    [/address/, "address", true],
  ];
  for (const [pattern, semantic, compatible] of rules) {
    if (
      pattern.test(name) &&
      compatible &&
      (numeric || ["string", "array"].includes(primitiveType))
    ) {
      semanticType = semantic;
      break;
    }
  }
  if (
    [
      "latitude",
      "longitude",
      "image",
      "audio",
      "video",
      "date",
      "datetime",
      "coordinate",
    ].includes(type)
  )
    semanticType = type === "datetime" ? "timestamp" : type;
  if (
    primitiveType === "string" &&
    values.some((v) => /^\s*<[a-z][\s\S]*>/i.test(String(v)))
  )
    semanticType = "html";
  if (name === "geometry" && primitiveType === "object")
    semanticType = "geometry";
  if (
    name === "coordinates" &&
    primitiveType === "array" &&
    /geometry/.test(parent)
  )
    semanticType = "coordinate";
  return {
    primitiveType: primitiveType as SemanticField["primitiveType"],
    type: type ?? "unknown",
    semanticType,
    confidence: consensus,
    evidence: [
      `${values.length} nonempty samples`,
      `Field ${parent ? parent + "." : ""}${key}`,
      `${Math.round(consensus * 100)}% type agreement`,
    ],
  };
}

export function compatibleHint(field: SemanticField, hint: SemanticValueType) {
  if (quantitativeTypes.includes(hint))
    return quantitativeTypes.includes(field.type);
  if (["latitude", "longitude"].includes(hint)) return field.type === hint;
  if (["image", "video", "audio", "url"].includes(hint))
    return ["url", "image", "video", "audio"].includes(field.type);
  if (["date", "datetime"].includes(hint))
    return ["date", "datetime"].includes(field.type);
  return (
    field.type === hint ||
    (hint === "category" && field.primitiveType === "string")
  );
}
