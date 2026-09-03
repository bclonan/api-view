import { shallowReactive } from "vue";
import type { ApiDefinition, CustomApiConfig } from "../types";
import { compileCustomApi } from "./custom";
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
import { firstWave } from "./providers/public-data";
import { morePublicData } from "./providers/more-public-data";
import { contentApi } from "./content";
import { openCollections } from "./providers/open-collections";
export const apis: ApiDefinition[] = shallowReactive([
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
  ...firstWave,
  ...morePublicData,
  ...openCollections,
]);
export const customApis: CustomApiConfig[] = shallowReactive([]);
export function registerCustomApi(value: unknown) {
  const { config, api } = compileCustomApi(value);
  const index = apis.findIndex((a) => a.id === config.id);
  if (index >= 0 && !config.id.startsWith("custom-"))
    throw new Error("Built-in APIs cannot be replaced.");
  const existing = customApis.findIndex((a) => a.id === config.id);
  if (existing < 0 && customApis.length >= 30)
    throw new Error("Keep up to 30 custom APIs on this device.");
  if (existing >= 0) customApis.splice(existing, 1, config);
  else customApis.push(config);
  if (index >= 0) apis.splice(index, 1, api);
  else apis.push(api);
  return api;
}
export function restoreCustomApis(definitions: unknown[]) {
  const validated = definitions.map((d) => compileCustomApi(d));
  if (
    validated.length > 30 ||
    new Set(validated.map((d) => d.api.id)).size !== validated.length
  )
    throw new Error("Invalid custom API library.");
  apis.splice(
    0,
    apis.length,
    ...apis.filter((a) => !a.id.startsWith("custom-")),
    ...validated.map((d) => d.api),
  );
  customApis.splice(0, customApis.length, ...validated.map((d) => d.config));
}
export function getOperation(apiId: string, operationId: string) {
  const api =
    apiId === contentApi.id ? contentApi : apis.find((a) => a.id === apiId);
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
    .filter(
      (w) =>
        w.length > 1 &&
        ![
          "the",
          "and",
          "for",
          "show",
          "find",
          "with",
          "from",
          "about",
          "that",
          "this",
          "data",
          "api",
          "public",
          "please",
          "me",
          "can",
          "what",
        ].includes(w),
    );
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
        availability: api.liveNotice ?? api.accessNote ?? "Live and sample",
        ...(api.keySetup ? { keySetup: api.keySetup } : {}),
        suggestedPresentations: [
          operation.preferred ?? "auto",
          "table",
          "json",
        ],
        score: words.reduce(
          (score, word) =>
            score +
            (`${api.name} ${api.description} ${api.keywords.join(" ")} ${operation.title} ${operation.description} ${operation.capability?.intents.join(" ") ?? ""} ${api.categories.join(" ")}`
              .toLowerCase()
              .includes(word)
              ? operation.capability?.intents.some((intent) =>
                  intent.toLowerCase().includes(word),
                )
                ? 4
                : 1
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
