import type { ApiDefinition, Operation, Row } from "../types";
export const defineApi = (definition: ApiDefinition) =>
  ({
    ...definition,
    operations: definition.operations.map((operation) => ({
      ...operation,
      capability: operation.capability ?? {
        id: `${definition.id}.${operation.id}`,
        intents: [...definition.keywords, operation.title],
        examples: [
          {
            prompt: operation.title,
            arguments: Object.fromEntries(
              Object.entries(operation.inputs)
                .filter(
                  ([, v]) =>
                    v.default !== undefined || (v.required && v.placeholder),
                )
                .map(([key, v]) => [key, v.default ?? v.placeholder]),
            ),
          },
        ],
        views: [operation.preferred ?? "auto", "table", "json"],
      },
    })),
  }) as ApiDefinition;
export const resultLimit = {
  type: "integer" as const,
  label: "Results",
  default: 12,
  minimum: 1,
  maximum: 100,
};
export const queryUrl = (endpoint: string, params: Row) => {
  const url = new URL(endpoint);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "")
      url.searchParams.set(key, String(value));
  });
  return url.href;
};
export const defineOperation = (operation: Operation) => operation;
