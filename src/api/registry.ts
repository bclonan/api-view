import type { ApiDefinition } from "../types";
import treasury from "./providers/treasury";
import openMeteo from "./providers/open-meteo";
import usgs from "./providers/usgs";
import openLibrary from "./providers/open-library";
import openFda from "./providers/open-fda";
import wikipedia from "./providers/wikipedia";
import geocoding from "./providers/geocoding";
import nasa from "./providers/nasa";
import census from "./providers/census";
import github from "./providers/github";
import pokeapi from "./providers/pokeapi";
import picsum from "./providers/picsum";
export const apis: ApiDefinition[] = [
  treasury,
  openMeteo,
  usgs,
  openLibrary,
  openFda,
  wikipedia,
  geocoding,
  nasa,
  census,
  github,
  pokeapi,
  picsum,
];
export function getOperation(apiId: string, operationId: string) {
  const api = apis.find((a) => a.id === apiId);
  const operation = api?.operations.find((o) => o.id === operationId);
  if (!api || !operation)
    throw new Error(
      `Unknown operation: ${apiId}/${operationId}. Search the catalog first.`,
    );
  return { api, operation };
}
export function searchApis(
  query = "",
  category?: string,
  limit = 8,
  auth: "none" | "any" = "any",
) {
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 1);
  return apis
    .filter(
      (api) =>
        auth === "any" || !api.authentication || api.authentication === "none",
    )
    .flatMap((api) =>
      api.operations.map((operation) => ({
        apiId: api.id,
        operationId: operation.id,
        name: operation.title,
        apiName: api.name,
        description: operation.description,
        categories: api.categories,
        authentication: api.authentication ?? "none",
        availability: api.liveNotice ?? "Live and sample",
        suggestedPresentations: [
          operation.preferred ?? "auto",
          "table",
          "json",
        ],
        score: words.reduce(
          (score, word) =>
            score +
            (`${api.name} ${api.description} ${api.keywords.join(" ")} ${operation.title} ${api.categories.join(" ")}`
              .toLowerCase()
              .includes(word)
              ? 1
              : 0),
          0,
        ),
      })),
    )
    .filter(
      (m) =>
        (!category ||
          m.categories.some(
            (c) => c.toLowerCase() === category.toLowerCase(),
          )) &&
        (!words.length || m.score > 0),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
