import type { Row } from "../types";
export type ImageCredit = {
  name?: string;
  authorUrl?: string;
  source?: string;
  sourceUrl?: string;
  license?: string;
};
function link(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function imageCredits(rows: Row[]): Map<string, ImageCredit> {
  const result = new Map<string, ImageCredit>();
  for (const row of rows) {
    if (!row.image_credit_name && !row.image_source_name) continue;
    const credit = {
      name:
        typeof row.image_credit_name === "string"
          ? row.image_credit_name
          : undefined,
      authorUrl: link(row.image_credit_url),
      source:
        typeof row.image_source_name === "string"
          ? row.image_source_name
          : undefined,
      sourceUrl: link(row.image_source_url),
      license: typeof row.license === "string" ? row.license : undefined,
    };
    for (const key of ["image_url", "full_image_url"]) {
      const url = link(row[key]);
      if (url) result.set(url, credit);
    }
  }
  return result;
}
