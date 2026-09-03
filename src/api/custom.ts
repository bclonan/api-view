import Ajv from "ajv";
import { pathParts } from "../runtime/fields";
import type { ApiDefinition, CustomApiConfig, Row } from "../types";
import { publicUrl } from "../runtime/requestPolicy";
import { inferStructure } from "../runtime/structure";
import { sourceFormats } from "../types";
import {
  transformsSchema,
  transformData,
  validateDataSettings,
} from "../runtime/bindings";
import { assertPublicSettings, publicSourceUrl } from "../sources/security";
export const customApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "baseUrl", "endpoint", "method", "sampleResponse"],
  properties: {
    id: { type: "string", pattern: "^custom-[a-z0-9-]{1,60}$" },
    name: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: "string", maxLength: 500 },
    baseUrl: { type: "string", maxLength: 1000 },
    endpoint: { type: "string", maxLength: 1000 },
    method: { enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
    inputs: {
      type: "object",
      maxProperties: 20,
      propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9_]{0,59}$" },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["type", "label"],
        properties: {
          type: { enum: ["string", "number", "integer", "date"] },
          label: { type: "string", maxLength: 120 },
          required: { type: "boolean" },
          default: { type: ["string", "number", "null"] },
          minimum: { type: "number" },
          maximum: { type: "number" },
          placeholder: { type: "string", maxLength: 500 },
        },
      },
    },
    query: {
      type: "object",
      maxProperties: 30,
      additionalProperties: { type: "string", maxLength: 1000 },
    },
    headers: {
      type: "object",
      maxProperties: 20,
      additionalProperties: { type: "string", maxLength: 1000 },
    },
    body: {},
    sampleResponse: {},
    responsePath: { type: "string", maxLength: 500 },
    responseSchema: { type: "object" },
    authentication: { enum: ["none", "api-key"] },
    format: { enum: [...sourceFormats] },
    selector: { type: "string", maxLength: 300 },
    permitted: { type: "boolean" },
    attribution: { type: "string", maxLength: 500 },
    license: { type: "string", maxLength: 500 },
    refreshSeconds: { type: "integer", minimum: 30, maximum: 86400 },
    transforms: transformsSchema,
    pagination: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "maxPages"],
      properties: {
        mode: { enum: ["page", "offset", "cursor", "next"] },
        parameter: { type: "string", maxLength: 100 },
        start: { type: "integer", minimum: 0 },
        sizeParameter: { type: "string", maxLength: 100 },
        size: { type: "integer", minimum: 1, maximum: 1000 },
        nextPath: { type: "string", maxLength: 500 },
        maxPages: { type: "integer", minimum: 1, maximum: 5 },
      },
    },
  },
};
const ajv = new Ajv({ strict: false, allowUnionTypes: true });
const validate = ajv.compile(customApiSchema);
export function compileCustomApi(input: unknown): {
  config: CustomApiConfig;
  api: ApiDefinition;
} {
  if (!validate(input))
    throw new Error(
      `Invalid API definition: ${ajv.errorsText(validate.errors)}`,
    );
  if (JSON.stringify(input).length > 500000)
    throw new Error("An API definition must be under 500 KB.");
  const config = JSON.parse(JSON.stringify(input)) as CustomApiConfig;
  assertPublicSettings({
    baseUrl: config.baseUrl,
    endpoint: config.endpoint,
    query: config.query,
    headers: config.headers,
    body: config.body,
    inputs: config.inputs,
  });
  validateDataSettings({}, config.transforms);
  if (config.pagination && config.method !== "GET")
    throw new Error(
      "Automatic pagination is available for public GET sources only.",
    );
  if (
    config.pagination &&
    ["cursor", "next"].includes(config.pagination.mode) &&
    !config.pagination.nextPath
  )
    throw new Error("Cursor and next-link pagination need a next-value path.");
  if (config.pagination?.nextPath) pathParts(config.pagination.nextPath);
  if (
    config.format === "graphql" &&
    /\b(mutation|subscription)\b/.test(
      JSON.stringify(config.body ?? config.query ?? {}),
    )
  )
    throw new Error("This GraphQL adapter supports read queries only.");
  const base = publicUrl(config.baseUrl);
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error("Use an HTTP or HTTPS URL without embedded credentials.");
  if (!config.endpoint.startsWith("/") || config.endpoint.startsWith("//"))
    throw new Error(
      "The endpoint must begin with one slash, such as /records/{id}.",
    );
  if (
    Object.keys(config.headers ?? {}).some((key) =>
      /^(cookie|host|origin|referer|content-length|proxy-|sec-)/i.test(key),
    )
  )
    throw new Error("Browser-controlled headers cannot be configured.");
  if (config.responsePath) pathParts(config.responsePath);
  if (config.responseSchema) ajv.compile(config.responseSchema);
  const template = (value: string, args: Row, encode = false) =>
    value.replace(/\{\{?([A-Za-z][A-Za-z0-9_]*)\}?\}/g, (_, key) => {
      if (!Object.hasOwn(config.inputs ?? {}, key))
        throw new Error(`Declare input ${key} before using it in a template.`);
      const v = String(args[key] ?? "");
      return encode ? encodeURIComponent(v) : v;
    });
  function bodyValue(value: unknown, args: Row): unknown {
    if (typeof value === "string") {
      const whole = /^\{\{?([A-Za-z][A-Za-z0-9_]*)\}?\}$/.exec(value);
      return whole && Object.hasOwn(args, whole[1])
        ? args[whole[1]]
        : template(value, args);
    }
    if (Array.isArray(value)) return value.map((v) => bodyValue(v, args));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [key, bodyValue(v, args)]),
      );
    return value;
  }
  const operation: ApiDefinition["operations"][number] = {
    id: "request",
    title: config.name,
    description: config.description ?? "A locally configured JSON API.",
    inputs: config.inputs ?? {},
    endpoint: new URL(config.endpoint, base).href,
    method: config.method,
    sourceConfig: config,
    buildUrl: (args) => {
      const url = new URL(template(config.endpoint, args, true), base);
      if (url.origin !== base.origin)
        throw new Error("The endpoint must stay on the configured API origin.");
      for (const [key, value] of Object.entries(config.query ?? {}))
        url.searchParams.set(key, template(value, args));
      return publicSourceUrl(url.href).href;
    },
    buildRequest: (args) => ({
      headers: Object.fromEntries(
        Object.entries(config.headers ?? {}).map(([key, value]) => [
          key,
          template(value, args),
        ]),
      ),
      ...(config.method !== "GET" && config.body !== undefined
        ? { body: JSON.stringify(bodyValue(config.body, args)) }
        : {}),
    }),
    sample: () => structuredClone(config.sampleResponse),
    extract: (raw) =>
      transformData(
        inferStructure(raw, config.responsePath || undefined).data,
        config.transforms ?? [],
      ),
    collectionPath: config.responsePath || undefined,
    responseSchema: config.responseSchema,
  };
  const defaults = Object.fromEntries(
    Object.entries(operation.inputs).map(([key, field]) => [
      key,
      field.default ?? "",
    ]),
  );
  operation.buildUrl(defaults);
  operation.buildRequest!(defaults);
  return {
    config,
    api: {
      id: config.id,
      name: config.name,
      description: config.description ?? "",
      categories: ["Custom"],
      keywords: [config.name],
      docs: base.href,
      icon: "Globe",
      authentication: config.authentication ?? "none",
      operations: [operation],
    },
  };
}
