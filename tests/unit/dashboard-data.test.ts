import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspace } from "../../src/stores/workspace";
import { compileCustomApi } from "../../src/api/custom";
import { restoreCustomApis, searchApis } from "../../src/api/registry";
import { invokeOperation } from "../../src/runtime/invoke";
import {
  discoverFields,
  flattenFields,
  readPath,
} from "../../src/runtime/fields";
import {
  transformData,
  validateDataSettings,
} from "../../src/runtime/bindings";
import { normalizeData } from "../../src/runtime/normalize";
import { compatibleComponents } from "../../src/blocks/definitions";
import { createToolRunner } from "../../src/webmcp/handlers";
import type { CustomApiConfig, DataTransform } from "../../src/types";
const debt = {
  apiId: "treasury",
  operationId: "debt-to-penny",
  arguments: { limit: 3 },
  mode: "sample" as const,
};
const custom: CustomApiConfig = {
  id: "custom-counties",
  name: "County data",
  baseUrl: "https://example.com",
  endpoint: "/records/{code}",
  method: "GET",
  inputs: { code: { type: "string", label: "Code", default: "MD" } },
  responsePath: "records",
  sampleResponse: {
    records: [
      {
        name: "Maryland",
        population: 6177224,
        properties: { magnitude: 4.6, time: 1788360000000 },
      },
      {
        name: "Virginia",
        population: 8631393,
        properties: { magnitude: null },
      },
    ],
  },
};
beforeEach(() => {
  setActivePinia(createPinia());
  restoreCustomApis([]);
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network call");
    }),
  );
});
describe("local dashboard library", () => {
  it("migrates the previous workspace, retains IDs and leaves the original backup intact", async () => {
    const store = useWorkspace();
    await store.createWidget(debt);
    const legacy = store.exportWorkspace();
    localStorage.setItem("api-canvas.workspace.v1", JSON.stringify(legacy));
    localStorage.setItem("api-canvas.dashboards.v2", "");
    setActivePinia(createPinia());
    const migrated = useWorkspace();
    await migrated.restore();
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.widgets[0].id).toBe(legacy.widgets[0].id);
    expect(
      JSON.parse(localStorage.getItem("api-canvas.workspace.v1")!),
    ).toEqual(legacy);
    expect(migrated.dashboards).toHaveLength(1);
  });
  it("switches and reloads independent dashboards, and clears only the active one", async () => {
    const store = useWorkspace();
    await store.restore();
    await store.createWidget(debt);
    store.rename("First");
    const first = store.id;
    await store.newDashboard("Second");
    const second = store.id;
    await store.createWidget(debt);
    store.clearDashboard();
    expect(store.widgets).toHaveLength(0);
    await store.undoClear();
    expect(store.widgets).toHaveLength(1);
    store.clearDashboard();
    await store.switchDashboard(first);
    expect(store.widgets).toHaveLength(1);
    setActivePinia(createPinia());
    const restored = useWorkspace();
    await restored.restore();
    expect(restored.id).toBe(first);
    expect(restored.dashboards.map((d) => d.title)).toEqual([
      "First",
      "Second",
    ]);
    await restored.switchDashboard(second);
    expect(restored.widgets).toHaveLength(0);
  });
  it("duplicates and deletes dashboards without deleting their neighbors", async () => {
    const store = useWorkspace();
    await store.restore();
    await store.createWidget(debt);
    const first = store.id;
    await store.duplicateDashboard("Copy");
    const copy = store.id;
    expect(copy).not.toBe(first);
    expect(store.widgets).toHaveLength(1);
    await store.deleteDashboard(copy);
    expect(store.id).toBe(first);
    expect(store.widgets).toHaveLength(1);
    await store.deleteDashboard(first);
    expect(store.dashboards).toHaveLength(1);
    expect(store.widgets).toHaveLength(0);
  });
  it("does not let a late request repopulate a cleared or switched dashboard", async () => {
    const store = useWorkspace();
    await store.restore();
    const created = await store.createWidget(debt);
    const raw = store.widgets[0].rawResponse;
    let finish!: (v: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const pending = store.updateWidget(created.id, { mode: "live" });
    store.clearDashboard();
    await store.newDashboard("Next");
    finish(new Response(JSON.stringify(raw), { status: 200 }));
    await pending;
    expect(store.widgets).toHaveLength(0);
    expect(store.title).toBe("Next");
  });
  it("rejects invalid imports before replacing the active dashboard", async () => {
    const store = useWorkspace();
    await store.createWidget(debt);
    const before = store.exportWorkspace();
    await expect(
      store.importWorkspace({
        ...before,
        widgets: [
          {
            ...before.widgets[0],
            bindings: { value: { path: "__proto__.polluted" } },
          },
        ],
      }),
    ).rejects.toThrow("reserved");
    expect(store.exportWorkspace()).toEqual(before);
  });
});
describe("arbitrary fields and components", () => {
  it("discovers nullable nested fields, timestamps and exact raw array paths without changing data", () => {
    const raw = structuredClone(custom.sampleResponse);
    const before = JSON.stringify(raw);
    const fields = flattenFields(discoverFields((raw as any).records));
    expect(fields.find((f) => f.key === "properties.magnitude")).toMatchObject({
      nullable: true,
      type: "number",
    });
    expect(fields.find((f) => f.key === "properties.time")?.type).toBe(
      "datetime",
    );
    expect(
      flattenFields(discoverFields((raw as any).records, false))[0].path,
    ).toBe("[].name");
    expect(readPath(raw, "records[0].properties.magnitude")).toBe(4.6);
    expect(readPath(raw, "records[].name")).toEqual(["Maryland", "Virginia"]);
    expect(JSON.stringify(raw)).toBe(before);
    expect(() => readPath(raw, "records.constructor")).toThrow("reserved");
  });
  it("recommends the same components for unrelated API identities", () => {
    const data = [{ details: { day: "2026-09-01", amount: 20 } }];
    const source = {
      apiId: "unknown",
      operationId: "request",
      invokedAt: "",
      mode: "sample" as const,
    };
    const first = normalizeData(data, source),
      second = normalizeData(data, { ...source, apiId: "nasa" });
    expect(compatibleComponents(first)).toEqual(compatibleComponents(second));
    expect(first.shape).toBe("timeseries");
    expect(
      compatibleComponents(first).find((d) => d.id === "line-chart")
        ?.compatible,
    ).toBe(true);
  });
  it("binds nested values and several sources into one component and keeps references after reload", async () => {
    const store = useWorkspace();
    store.defineCustomApi(custom);
    const a = await store.createWidget({
      apiId: custom.id,
      operationId: "request",
      arguments: {},
      mode: "sample",
    });
    const b = await store.createWidget(debt);
    await store.updateWidget(b.id, {
      bindings: {
        value: {
          sourceId: a.id,
          origin: "raw",
          path: "records[0].population",
          label: "Population",
        },
        title: { literal: "Maryland" },
        earthquake: {
          sourceId: a.id,
          origin: "raw",
          path: "records[0].properties.magnitude",
        },
      },
      presentation: { type: "metric" },
    });
    const result = store.resultForWidget(b.id);
    expect(result.result?.data).toEqual([
      { value: 6177224, title: "Maryland", earthquake: 4.6 },
    ]);
    expect(result.provenance).toHaveLength(2);
    const raw = store.getWidget(b.id).rawResponse;
    await store.transformWidget(b.id, { type: "table" });
    expect(store.getWidget(b.id).rawResponse).toBe(raw);
    setActivePinia(createPinia());
    const restored = useWorkspace();
    await restored.restore();
    expect(restored.resultForWidget(b.id).result?.data).toEqual(
      result.result?.data,
    );
    restored.removeWidget(a.id);
    expect(restored.resultForWidget(b.id).issues[0]).toContain("removed");
    expect(restored.getWidget(b.id).status).toBe("ready");
  });
  it("changes dataset paths, transforms and presentation without fetching again", async () => {
    const store = useWorkspace();
    store.defineCustomApi(custom);
    const w = await store.createWidget({
      apiId: custom.id,
      operationId: "request",
      arguments: {},
      mode: "sample",
    });
    const raw = store.getWidget(w.id).rawResponse;
    await store.updateWidget(w.id, {
      bindings: { $data: { origin: "raw", path: "records" } },
      transforms: [
        { op: "sort", field: "population", direction: "desc" },
        { op: "limit", count: 1 },
      ],
    });
    expect((store.resultForWidget(w.id).result!.data as any[])[0].name).toBe(
      "Virginia",
    );
    expect(store.getWidget(w.id).rawResponse).toBe(raw);
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("declarative transforms", () => {
  const rows = [
    { place: "A", value: 2, weight: 3 },
    { place: "B", value: 4, weight: 2 },
    { place: "A", value: 6, weight: 1 },
  ];
  it("supports selection, renaming, filtering, sorting, limiting and arithmetic", () => {
    const steps: DataTransform[] = [
      { op: "filter", field: "value", comparison: "gte", value: 4 },
      {
        op: "derive",
        fields: ["value", "weight"],
        calculation: "product",
        as: "total",
      },
      { op: "sort", field: "total", direction: "desc" },
      { op: "limit", count: 1 },
      { op: "select", fields: ["place", "total"] },
      { op: "rename", field: "place", as: "name" },
    ];
    validateDataSettings({}, steps);
    expect(transformData(rows, steps)).toEqual([{ name: "B", total: 8 }]);
    expect(rows[0]).toEqual({ place: "A", value: 2, weight: 3 });
  });
  it("supports aggregation, grouping, flattening, merging and bounded left joins", () => {
    expect(
      transformData(rows, [
        { op: "aggregate", method: "mean", field: "value" },
      ]),
    ).toEqual([{ value: 4 }]);
    expect(
      transformData(rows, [
        {
          op: "group",
          field: "place",
          rightField: "value",
          method: "sum",
          as: "total",
        },
      ]),
    ).toEqual([
      { place: "A", total: 8 },
      { place: "B", total: 4 },
    ]);
    expect(
      transformData({ records: rows }, [
        { op: "flatten", field: "records" },
        { op: "map", mapping: { label: "place" } },
      ]),
    ).toHaveLength(3);
    expect(
      transformData(rows, [{ op: "merge", sourceId: "other" }], () => [
        { place: "C" },
      ]),
    ).toHaveLength(4);
    expect(
      (
        transformData(
          rows,
          [{ op: "join", sourceId: "other", field: "place", rightField: "id" }],
          () => [{ id: "A", label: "Alpha" }],
        ) as any[]
      )[0].joined.label,
    ).toBe("Alpha");
  });
  it("rejects executable or malformed settings before applying them", () => {
    expect(() =>
      validateDataSettings({}, [{ op: "evaluate", code: "fetch(url)" }] as any),
    ).toThrow();
    expect(() => validateDataSettings({}, [{ op: "sort" }] as any)).toThrow(
      "requires field",
    );
    expect(() =>
      validateDataSettings({ value: { path: "constructor.prototype" } }),
    ).toThrow("reserved");
    expect(() =>
      validateDataSettings({}, [{ op: "limit", count: -1 }]),
    ).toThrow();
  });
});
describe("custom APIs use the existing executor", () => {
  it("does not repeat a non-GET live request when restoring or switching dashboards", async () => {
    const store = useWorkspace();
    store.defineCustomApi({ ...custom, method: "POST" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(custom.sampleResponse), { status: 200 }),
      ),
    );
    await store.createWidget({
      apiId: custom.id,
      operationId: "request",
      arguments: {},
      mode: "live",
    });
    const original = store.id;
    expect(fetch).toHaveBeenCalledTimes(1);
    await store.newDashboard("Other");
    await store.switchDashboard(original);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.widgets[0].status).toBe("draft");
    setActivePinia(createPinia());
    await useWorkspace().restore();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses path/query templates, typed JSON bodies, headers and response schemas", async () => {
    const { api } = compileCustomApi({
      ...custom,
      method: "POST",
      endpoint: "/search/{code}",
      query: { locale: "{code}" },
      headers: { "X-Example": "{code}" },
      body: { region: "{code}" },
      responseSchema: { type: "object", required: ["records"] },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(custom.sampleResponse), { status: 200 }),
      ),
    );
    const result = await invokeOperation(
      api,
      api.operations[0],
      { code: "a/b & c" },
      "live",
    );
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("a%2Fb%20%26%20c");
    expect(request).toMatchObject({
      method: "POST",
      credentials: "omit",
      headers: { "X-Example": "a/b & c" },
      body: JSON.stringify({ region: "a/b & c" }),
    });
    expect(result.rawResponse).toEqual(custom.sampleResponse);
    expect(
      result.result.fields.some((f) => f.key === "properties.magnitude"),
    ).toBe(true);
  });
  it("makes custom sources searchable and exportable without changing built-ins", async () => {
    const store = useWorkspace();
    store.defineCustomApi(custom);
    expect(searchApis("County data")[0].apiId).toBe(custom.id);
    await store.createWidget({
      apiId: custom.id,
      operationId: "request",
      arguments: {},
      mode: "sample",
    });
    const exported = store.exportWorkspace();
    expect(exported.customApis).toHaveLength(1);
    restoreCustomApis([]);
    setActivePinia(createPinia());
    const imported = useWorkspace();
    await imported.importWorkspace(exported);
    expect(imported.widgets[0].status).toBe("ready");
    expect(searchApis("debt")[0].apiId).toBe("treasury");
  });
  it("rejects unsafe URL definitions and conflicting imported API IDs", async () => {
    expect(() =>
      compileCustomApi({ ...custom, baseUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      compileCustomApi({ ...custom, endpoint: "//other.example/secret" }),
    ).toThrow();
    expect(() => compileCustomApi({ ...custom, id: "treasury" })).toThrow();
    const store = useWorkspace();
    store.defineCustomApi(custom);
    await store.createWidget({
      apiId: custom.id,
      operationId: "request",
      arguments: {},
      mode: "sample",
    });
    const before = store.exportWorkspace();
    await expect(
      store.importWorkspace({
        ...before,
        customApis: [{ ...custom, name: "Changed" }],
      }),
    ).rejects.toThrow("different settings");
    expect(store.exportWorkspace()).toEqual(before);
  });
  it("exposes the same dashboard, custom API and binding actions through native contracts", async () => {
    const store = useWorkspace();
    await store.restore();
    const run = createToolRunner(store);
    expect((await run("define_api", { definition: custom })).isError).toBe(
      false,
    );
    expect(
      (
        await run("manage_dashboard", {
          action: "create",
          title: "Tools dashboard",
        })
      ).isError,
    ).toBe(false);
    const created = JSON.parse(
      (
        await run("create_widget", {
          apiId: custom.id,
          operationId: "request",
          arguments: {},
          mode: "sample",
        })
      ).content[0].text,
    );
    expect(
      (await run("inspect_widget", { widgetId: created.id })).isError,
    ).toBe(false);
    expect(
      (await run("list_components", { widgetId: created.id })).isError,
    ).toBe(false);
    expect(
      (
        await run("update_widget", {
          widgetId: created.id,
          patch: {
            bindings: {
              value: { origin: "raw", path: "records[0].population" },
            },
            presentation: { type: "metric" },
            position: 0,
          },
        })
      ).isError,
    ).toBe(false);
    expect(
      (
        await run("manage_dashboard", {
          action: "clear",
          dashboardId: store.id,
        })
      ).isError,
    ).toBe(true);
    expect(store.widgets).toHaveLength(1);
    expect(
      (
        await run("manage_dashboard", {
          action: "clear",
          dashboardId: store.id,
          confirm: true,
        })
      ).isError,
    ).toBe(false);
    expect(store.widgets).toHaveLength(1);
    store.clearDashboard();
    expect(store.widgets).toHaveLength(0);
    expect(
      (await run("manage_dashboard", { action: "undo-clear" })).isError,
    ).toBe(false);
    expect(store.widgets).toHaveLength(1);
  });
});
