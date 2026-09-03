import { beforeEach, describe, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  decodeSource,
  detectFormat,
  parseCsv,
} from "../../src/sources/adapters";
import { publicSourceUrl, stableId } from "../../src/sources/security";
import { robotsAllows } from "../../src/sources/fetch";
import {
  sourceConfiguration,
  inspectSource,
  rankCandidates,
} from "../../src/sources/discovery";
import { compileCustomApi } from "../../src/api/custom";
import { invokeOperation } from "../../src/runtime/invoke";
import { useWorkspace } from "../../src/stores/workspace";
import { useEditor } from "../../src/stores/editor";
import { restoreCustomApis } from "../../src/api/registry";
import { boundResult, transformData } from "../../src/runtime/bindings";
import {
  shareState,
  encodeShare,
  decodeShare,
} from "../../src/workspace/share";
import { pageContext } from "../../src/workspace/context";
import { createToolRunner } from "../../src/webmcp/handlers";
import {
  workspaceContracts,
  workspaceOutputSchema,
} from "../../src/webmcp/workspaceTools";
import Ajv from "ajv";
const url = "https://data.example.org/records";
beforeEach(() => {
  setActivePinia(createPinia());
  restoreCustomApis([]);
  const memory = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected live request");
    }),
  );
});
describe("public source adapters", () => {
  it("parses quoted CSV, preserves identifiers and rejects malformed rows", () => {
    expect(
      parseCsv('id,name,value\r\n001,"One, two",1.5\r\n002,"three\nfour",0'),
    ).toEqual([
      { id: "001", name: "One, two", value: 1.5 },
      { id: "002", name: "three\nfour", value: 0 },
    ]);
    expect(() => parseCsv("a,b\n1")).toThrow(/values/);
    expect(() => parseCsv('a\n"unterminated')).toThrow(/unclosed/);
  });
  it.each([
    ["json", '[{"name":"Alpha","value":3}]', "application/json"],
    ["csv", "name,value\nAlpha,3", "text/csv"],
    [
      "rss",
      "<rss><channel><item><title>Alpha</title><link>https://example.org/a</link></item></channel></rss>",
      "application/xml",
    ],
    [
      "atom",
      '<feed><entry><title>Alpha</title><link href="https://example.org/a"/></entry></feed>',
      "application/xml",
    ],
    [
      "jsonld",
      '{"@context":"https://schema.org","name":"Alpha"}',
      "application/ld+json",
    ],
  ] as const)("detects and decodes %s", (format, text, contentType) => {
    expect(detectFormat(text, contentType, url)).toBe(format);
    expect(
      JSON.stringify(decodeSource(text, { url, contentType }).value),
    ).toContain("Alpha");
  });
  it("extracts permitted HTML tables without executing scripts", () => {
    const html =
      '<html><title>Public table</title><script>throw new Error("executed")</script><table><tr><th>name</th><th>value</th></tr><tr><td>Alpha</td><td>3</td></tr></table></html>';
    expect(() => decodeSource(html, { url })).toThrow(/permitted/);
    expect(decodeSource(html, { url, permitted: true }).value).toEqual([
      { name: "Alpha", value: 3 },
    ]);
    expect(() =>
      decodeSource(
        html.replace(
          "<title>",
          '<meta name="robots" content="noarchive"><title>',
        ),
        { url, permitted: true },
      ),
    ).toThrow(/restrictions/);
  });
  it("reads embedded JSON and JSON-LD graphs and rejects entity declarations", () => {
    expect(
      decodeSource(
        '<html><script type="application/ld+json">{"@graph":[{"name":"Alpha"}]}</script></html>',
        { url, permitted: true },
      ).value,
    ).toEqual([{ name: "Alpha" }]);
    expect(() =>
      decodeSource(
        '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>',
        { url },
      ),
    ).toThrow(/entities/);
  });
  it("unwraps CKAN, GraphQL and ArcGIS and reports provider errors", () => {
    expect(
      decodeSource('{"success":true,"result":{"records":[{"value":1}]}}', {
        url,
      }).value,
    ).toEqual([{ value: 1 }]);
    expect(
      decodeSource('{"data":{"records":[{"value":2}]}}', {
        url,
        format: "graphql",
      }).value,
    ).toEqual({ records: [{ value: 2 }] });
    expect(
      decodeSource(
        '{"features":[{"attributes":{"name":"A"},"geometry":{"x":1,"y":2}}]}',
        { url },
      ).value,
    ).toEqual([{ name: "A", longitude: 1, latitude: 2 }]);
    expect(() =>
      decodeSource('{"errors":[{"message":"Query denied"}]}', {
        url,
        format: "graphql",
      }),
    ).toThrow("Query denied");
  });
  it("honors robots groups, longest matches and wildcards", () => {
    const rules =
      "User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.json$";
    expect(robotsAllows(rules, "/private/x")).toBe(false);
    expect(robotsAllows(rules, "/private/public/data")).toBe(true);
    expect(robotsAllows(rules, "/file.json")).toBe(false);
    expect(robotsAllows(rules, "/file.csv")).toBe(true);
  });
  it.each([
    "https://127.0.0.1/a",
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com?api_key=secret",
  ])("rejects unsafe or secret URLs %s", (value) =>
    expect(() => publicSourceUrl(value)).toThrow(),
  );
  it("uses deterministic IDs independent of key order", () => {
    expect(stableId("source", { a: 1, b: 2 })).toBe(
      stableId("source", { b: 2, a: 1 }),
    );
  });
  it("fetches paginated real-shaped responses and retains each raw page", async () => {
    const config = sourceConfiguration(url, { format: "json" });
    config.responsePath = "records";
    config.pagination = { mode: "page", parameter: "page", maxPages: 2 };
    config.transforms = [
      { op: "aggregate", field: "value", method: "sum", as: "total" },
    ];
    vi.mocked(fetch).mockImplementation(
      async (request) =>
        new Response(
          JSON.stringify({
            records: [
              {
                value: Number(
                  new URL(String(request)).searchParams.get("page"),
                ),
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
    const { api } = compileCustomApi(config);
    const response = await invokeOperation(api, api.operations[0], {}, "live");
    expect(response.result.data).toEqual([{ total: 3 }]);
    expect((response.rawResponse as any).pages).toHaveLength(2);
    expect(response.result.metadata.provenance).toMatchObject({
      pages: 2,
      url,
    });
  });
  it("does not replace rate limits or CORS failures with sample data", async () => {
    const config = sourceConfiguration(url, {
      sampleResponse: [{ invented: true }],
    });
    const { api } = compileCustomApi(config);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("limit", { status: 429, headers: { "Retry-After": "60" } }),
    );
    await expect(
      invokeOperation(api, api.operations[0], {}, "live"),
    ).rejects.toMatchObject({ detail: { code: "429", retryAfter: 60 } });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(
      invokeOperation(api, api.operations[0], {}, "live"),
    ).rejects.toThrow("Failed to fetch");
  });
  it("discovers GET operations in previously unknown OpenAPI docs", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Fresh source" },
          servers: [{ url: "https://unknown.example.org/v1" }],
          paths: {
            "/items": {
              get: {
                summary: "New items",
                parameters: [
                  {
                    name: "limit",
                    in: "query",
                    schema: { type: "integer", default: 2 },
                  },
                ],
              },
            },
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await inspectSource(url);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.kind).toBe("documentation");
      expect(result.candidates[0].configuration).toMatchObject({
        baseUrl: "https://unknown.example.org",
        endpoint: "/v1/items",
        inputs: { limit: { type: "integer", default: 2 } },
      });
    }
  });
  it("does not rank unrelated sources solely because they need no authentication", () => {
    expect(
      rankCandidates("earthquakes", [
        {
          id: "a",
          title: "Cats",
          url,
          format: "json",
          score: 100,
          reasons: [],
          access: "not-tested",
          authentication: "none",
          license: "Not declared",
        },
      ]),
    ).toEqual([]);
  });
});
async function sources() {
  const store = useWorkspace();
  const ids: string[] = [];
  for (const [name, rows] of [
    [
      "Left",
      [
        { id: "A", value: 2 },
        { id: "B", value: 3 },
      ],
    ],
    [
      "Right",
      [
        { id: "A", region: "East" },
        { id: "B", region: "West" },
      ],
    ],
  ] as const) {
    const definition = sourceConfiguration(`${url}/${name}`, {
      name,
      sampleResponse: rows,
    });
    const saved = store.defineCustomApi(definition);
    ids.push(
      (await store.createWidget({ ...saved, arguments: {}, mode: "sample" }))
        .id,
    );
  }
  return { store, left: ids[0], right: ids[1] };
}
describe("derived blocks, persistence and safe sharing", () => {
  it("joins two source cards, updates recursively and avoids duplicate creation", async () => {
    const { store, left, right } = await sources();
    const options = {
      sourceIds: [left, right],
      bindings: { $data: { sourceId: left, path: "$" } },
      transforms: [
        { op: "join" as const, sourceId: right, field: "id", rightField: "id" },
      ],
    };
    const derived = store.createDerived(options);
    expect(store.createDerived(options).id).toBe(derived.id);
    const display = store.resultForWidget(derived.id);
    expect(display.result?.data).toEqual([
      { id: "A", value: 2, joined: { id: "A", region: "East" } },
      { id: "B", value: 3, joined: { id: "B", region: "West" } },
    ]);
    expect(new Set(display.provenance.map((p) => p.sourceId))).toEqual(
      new Set([left, right]),
    );
    const next = store.createDerived({
      sourceIds: [derived.id],
      transforms: [{ op: "aggregate", field: "value", method: "sum" }],
    });
    expect(store.resultForWidget(next.id).result?.data).toEqual([{ value: 5 }]);
    await store.updateWidget(
      left,
      {
        transforms: [
          { op: "filter", field: "id", comparison: "eq", value: "A" },
        ],
      },
      false,
    );
    expect(store.resultForWidget(next.id).result?.data).toEqual([{ value: 2 }]);
    await expect(
      store.updateWidget(
        left,
        { bindings: { $data: { sourceId: next.id, path: "$" } } },
        false,
      ),
    ).rejects.toThrow(/circular/);
  });
  it("rejects duplicate and incompatible join keys", () => {
    const join = [
      { op: "join" as const, sourceId: "right", field: "id", rightField: "id" },
    ];
    expect(() =>
      transformData([{ id: "A" }], join, () => [{ id: "A" }, { id: "A" }]),
    ).toThrow(/Duplicate/);
    expect(() => transformData([{ id: 1 }], join, () => [{ id: "1" }])).toThrow(
      /types differ/,
    );
  });
  it("shows missing sources as issues instead of stale fabricated values", async () => {
    const { store, left, right } = await sources();
    const card = store.createDerived({
      sourceIds: [left, right],
      bindings: { value: { sourceId: right, path: "[0].region" } },
    });
    store.removeWidget(right);
    expect(store.resultForWidget(card.id).issues.join(" ")).toContain(
      "removed",
    );
  });
  it("preserves derived definitions and field tags across dashboard reload", async () => {
    const { store, left, right } = await sources();
    store.selectFields([
      {
        sourceId: left,
        path: "[0].value",
        origin: "data",
        tags: ["measure"],
        unit: "km",
      },
    ]);
    const card = store.createDerived({
      sourceIds: [left, right],
      bindings: {
        title: { sourceId: right, path: "[0].region" },
        value: { sourceId: left, path: "[0].value" },
      },
    });
    const oldId = store.id;
    setActivePinia(createPinia());
    const restored = useWorkspace();
    await restored.restore();
    expect(restored.id).toBe(oldId);
    expect(restored.getWidget(card.id).derived?.sourceIds).toEqual([
      left,
      right,
    ]);
    expect(restored.resultForWidget(card.id).result?.data).toEqual([
      { title: "East", value: 2 },
    ]);
    expect(restored.fieldSelections[0].unit).toBe("km");
  });
  it("retains mappings, filters, data and provenance in a share snapshot without credentials", async () => {
    const { store, left, right } = await sources();
    await store.updateWidget(
      left,
      {
        transforms: [
          { op: "filter", field: "value", comparison: "gte", value: 2 },
        ],
      },
      false,
    );
    const card = store.createDerived({
      sourceIds: [left, right],
      title: "Shared summary",
      bindings: {
        value: { sourceId: left, path: "[0].value" },
        title: { sourceId: right, path: "[0].region" },
      },
    });
    store.getWidget(left).rawResponse = {
      records: [{ value: 2 }],
      api_key: "SECRET_FIXTURE_934",
      nested: { Authorization: "Bearer SECRET_FIXTURE_934" },
    };
    store.getWidget(left).requestUrl =
      "https://example.org/data?token=SECRET_FIXTURE_934&limit=2";
    const state = decodeShare(encodeShare(shareState(store)));
    expect(JSON.stringify(state)).not.toContain("SECRET_FIXTURE_934");
    expect(state.widgets.find((w) => w.id === left)?.transforms).toHaveLength(
      1,
    );
    expect(
      boundResult(
        state.widgets.find((w) => w.id === card.id)!,
        state.widgets,
      ).result?.data,
    ).toEqual([{ value: 2, title: "East" }]);
    expect(pageContext(store).blocks).toHaveLength(3);
    expect(JSON.stringify(pageContext(store))).not.toContain(
      "SECRET_FIXTURE_934",
    );
  });
  it("does not mutate a dashboard when importing a cyclic graph", async () => {
    const { store, left, right } = await sources();
    const exported = store.exportWorkspace();
    exported.widgets[0].bindings = { $data: { sourceId: right, path: "$" } };
    exported.widgets[1].bindings = { $data: { sourceId: left, path: "$" } };
    await expect(store.importWorkspace(exported)).rejects.toThrow(/circular/);
    expect(store.widgets[0].bindings).toBeUndefined();
  });
  it("rejects mixed-unit aggregation until the mapping is corrected", async () => {
    const { store, left, right } = await sources();
    store.selectFields([
      {
        sourceId: left,
        path: "[0].value",
        origin: "data",
        tags: [],
        unit: "km",
      },
      {
        sourceId: right,
        path: "[0].region",
        origin: "data",
        tags: [],
        unit: "miles",
      },
    ]);
    expect(() =>
      store.createDerived({
        sourceIds: [left, right],
        transforms: [{ op: "aggregate", method: "sum", field: "value" }],
      }),
    ).toThrow(/units/);
  });
});
describe("generic WebMCP contracts", () => {
  it("rejects extra input properties and validates every new output envelope", async () => {
    const { store, left } = await sources();
    const run = createToolRunner(store);
    const validate = new Ajv({ strict: false, allowUnionTypes: true }).compile(
      workspaceOutputSchema,
    );
    for (const tool of workspaceContracts) {
      expect(tool.schema.additionalProperties).toBe(false);
      const reply = JSON.parse(
        (await run(tool.name, { unexpected: true })).content[0].text,
      );
      expect(reply.ok).toBe(false);
      expect(validate(reply), tool.name).toBe(true);
    }
    const list = JSON.parse((await run("list_blocks", {})).content[0].text);
    expect(list.data.widgets[0].id).toBe(left);
    expect(validate(list)).toBe(true);
  });
  it("requires a visible human action for deletion and keeps reversible controls editable", async () => {
    const { store, left } = await sources();
    const run = createToolRunner(store);
    expect((await run("delete_block", { blockId: left })).isError).toBe(false);
    expect(store.widgets).toHaveLength(2);
    expect(useEditor().pendingDelete?.widgetId).toBe(left);
    await run("collapse_sidebar", { collapsed: true });
    expect(useEditor().collapsed).toBe(true);
    await run("select_map_tag_fields", {
      fields: [
        { sourceId: left, path: "[0].value", origin: "data", tags: ["chosen"] },
      ],
    });
    expect(store.fieldSelections[0].tags).toEqual(["chosen"]);
  });
});
