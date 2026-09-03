import { readPath, appendPath } from "./fields";
import type { Row } from "../types";
import { scenarioCollection, normalizeScenario } from "./scenarios";
const object = (v: unknown): v is Row =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function inferStructure(
  raw: unknown,
  path?: string,
): { data: unknown; collectionPath?: string; score?: number } {
  if (path !== undefined) {
    const selected = readPath(raw, path);
    const levels = (path.match(/\[\]/g) ?? []).length;
    return {
      data:
        Array.isArray(selected) && levels > 1
          ? selected.flat(levels - 1)
          : selected,
      collectionPath: path,
    };
  }
  if (Array.isArray(raw)) return { data: raw, collectionPath: "$" };
  if (!object(raw)) return { data: raw };
  const scenario = scenarioCollection(raw);
  if (scenario) return scenario;
  if (Array.isArray(raw.nodes) && Array.isArray(raw.edges))
    return { data: raw, collectionPath: "$" };
  if (raw.type === "FeatureCollection" && Array.isArray(raw.features))
    return { data: raw.features, collectionPath: "features" };
  const candidates: {
    data: unknown[];
    collectionPath: string;
    score: number;
  }[] = [];
  function visit(value: Row, parent = "", depth = 0) {
    if (depth > 3) return;
    for (const [key, child] of Object.entries(value).slice(0, 40)) {
      const p = appendPath(parent, key);
      if (Array.isArray(child))
        candidates.push({
          data: child,
          collectionPath: p,
          score:
            (/^(results|items|records|data|studies|features|entries|hits)$/.test(
              key,
            )
              ? 100
              : 0) +
            (child.some(object) ? 30 : 0) -
            depth * 10,
        });
      else if (object(child)) visit(child, p, depth + 1);
    }
  }
  visit(raw);
  candidates.sort((a, b) => b.score - a.score);
  // Unknown primitive arrays such as RGB, tags, or date-parts are record fields.
  return candidates[0]?.score >= 30 ? candidates[0] : { data: raw };
}

export function normalizeStructure(data: unknown): unknown {
  const feature = (v: unknown): unknown => {
    if (!object(v)) return v;
    const geometry = v.type === "Feature" ? v.geometry : v;
    if (
      object(geometry) &&
      geometry.type === "Point" &&
      Array.isArray(geometry.coordinates)
    ) {
      const [longitude, latitude, depth] = geometry.coordinates;
      return {
        ...(object(v.properties) ? v.properties : {}),
        ...v,
        longitude,
        latitude,
        ...(depth !== undefined ? { depth } : {}),
      };
    }
    return normalizeScenario(v);
  };
  if (object(data) && data.type === "FeatureCollection")
    return Array.isArray(data.features) ? data.features.map(feature) : [];
  if (Array.isArray(data)) return data.map(feature);
  // Column-oriented time series become rows, with original values intact.
  if (object(data) && Array.isArray(data.time)) {
    const times = data.time;
    const columns = Object.entries(data).filter(
      ([, v]) => Array.isArray(v) && v.length === times.length,
    );
    return times
      .slice(0, 5000)
      .map((_, i) =>
        Object.fromEntries(columns.map(([k, v]) => [k, (v as unknown[])[i]])),
      );
  }
  return feature(data);
}
