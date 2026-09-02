import type { ApiDefinition, Operation, Row } from "../types";
export const defineApi = (definition: ApiDefinition) => definition;
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
