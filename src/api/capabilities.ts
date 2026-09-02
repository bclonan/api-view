import { apis, getOperation, searchApis } from "./registry";
import type { Row } from "../types";
export function getCapability(sourceId: string, capabilityId: string) {
  const api = apis.find((a) => a.id === sourceId);
  const op = api?.operations.find(
    (o) => o.id === capabilityId || o.capability?.id === capabilityId,
  );
  if (!api || !op)
    throw new Error("Capability not found. Search the catalog first.");
  return getOperation(api.id, op.id);
}
export function inspectCapability(sourceId: string, capabilityId: string) {
  const { api, operation: o } = getCapability(sourceId, capabilityId);
  return {
    sourceId: api.id,
    capabilityId: o.capability?.id ?? `${api.id}.${o.id}`,
    operationId: o.id,
    title: o.title,
    description: o.description,
    inputs: o.inputs,
    examples: o.capability?.examples ?? [],
    intents: o.capability?.intents ?? api.keywords,
    request: { method: o.method ?? "GET", endpoint: o.endpoint },
    response: { collectionPath: o.collectionPath, hints: o.hints },
    recommendedViews: o.capability?.views ?? [
      o.preferred ?? "auto",
      "table",
      "json",
    ],
    authentication: api.authentication ?? "none",
    browser: api.browser ?? { expectedCors: "unknown" },
    docs: api.docs,
  };
}
export function searchCapabilities(
  query: string,
  options: {
    categories?: string[];
    noAuthOnly?: boolean;
    browserCompatibleOnly?: boolean;
    health?: Record<string, Row>;
  } = {},
) {
  return searchApis(
    query,
    undefined,
    100,
    options.noAuthOnly === false ? "any" : "none",
  )
    .filter(
      (m) =>
        !options.categories?.length ||
        options.categories.some((c) => m.categories.includes(c)),
    )
    .filter(
      (m) =>
        !options.browserCompatibleOnly ||
        options.health?.[`${m.apiId}/${m.operationId}`]?.status === "ok" ||
        apis.find((a) => a.id === m.apiId)?.browser?.expectedCors === "yes",
    )
    .map((m) => ({
      ...m,
      ...inspectCapability(m.apiId, m.operationId),
      score: m.score,
      health: options.health?.[`${m.apiId}/${m.operationId}`],
    }))
    .slice(0, 20);
}
export function exampleArguments(sourceId: string, capabilityId: string): Row {
  const { operation } = getCapability(sourceId, capabilityId);
  return {
    ...Object.fromEntries(
      Object.entries(operation.inputs)
        .filter(([, v]) => v.default !== undefined)
        .map(([k, v]) => [k, v.default]),
    ),
    ...operation.capability?.examples[0]?.arguments,
  };
}
