import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { detectValue } from "../../src/runtime/detectValue";
import { normalize } from "../../src/runtime/normalize";
import { invoke, validateArguments } from "../../src/runtime/invoke";
import { apis, getOperation, searchApis } from "../../src/api/registry";
import { useWorkspace } from "../../src/stores/workspace";
import { createToolRunner } from "../../src/webmcp/handlers";
import { contracts } from "../../src/webmcp/contracts";
import type { Operation } from "../../src/types";
const debt = {
  apiId: "treasury",
  operationId: "debt-to-penny",
  arguments: { limit: 8 },
};
beforeEach(() => {
  setActivePinia(createPinia());
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request in sample test");
    }),
  );
});
describe("semantic detection", () => {
  it.each([
    ["market_value", 3821992120000, "currency"],
    ["image_url", "https://example.com/picture", "image"],
    ["published", "2026-09-02", "date"],
    ["available", true, "boolean"],
    ["state_id", "001", "identifier"],
    ["latitude", 39.2, "latitude"],
    ["longitude", -76.61, "longitude"],
    ["count", "123", "integer"],
    ["url", "javascript:alert(1)", "text"],
    ["share_percent", 10, "percent"],
    ["audio", "https://example.com/file.mp3", "audio"],
    ["email", "person@example.com", "email"],
    ["null", null, "unknown"],
  ])("detects %s", (key, value, type) => {
    expect(detectValue({ key: String(key), value }).type).toBe(type);
  });
  it("identifies a timeseries without adapter hints", () => {
    const operation = {
      id: "generic",
      extract: (r: unknown) => r,
    } as Operation;
    const result = normalize(
      [
        { date: "2026-08-30", value: "108" },
        { date: "2026-08-31", value: 112 },
      ],
      operation,
      "generic",
      "sample",
    );
    expect(result.shape).toBe("timeseries");
    expect(result.suggestedPresentations[0]).toBe("line-chart");
  });
  it.each(apis.map((api) => [api.id, api.operations[0].id]))(
    "normalizes the %s fixture",
    async (apiId, operationId) => {
      const { operation } = getOperation(apiId, operationId);
      const args = Object.fromEntries(
        Object.entries(operation.inputs)
          .filter(([, f]) => f.required)
          .map(([key, f]) => [key, f.type === "number" ? 0 : "Baltimore"]),
      );
      const result = await invoke(apiId, operationId, args, "sample");
      expect(result.rawResponse).toBeDefined();
      expect(result.result.fields.length).toBeGreaterThan(0);
      expect(result.result.source.mode).toBe("sample");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("finds the correct operation from intent", () =>
    expect(searchApis("historical federal debt")[0].apiId).toBe("treasury"));
});
describe("input and transport boundaries", () => {
  it("keeps missing arguments distinct from invalid arguments", () => {
    expect(validateArguments("open-meteo", "forecast", {}).missing).toEqual([
      "latitude",
      "longitude",
    ]);
    expect(() =>
      validateArguments("open-meteo", "forecast", {
        latitude: 95,
        longitude: 0,
      }),
    ).toThrow("between");
    expect(() =>
      validateArguments("open-meteo", "forecast", { latitude: false }),
    ).toThrow("number");
    expect(() =>
      validateArguments("treasury", "debt-to-penny", { limit: 4.5 }),
    ).toThrow("integer");
  });
  it("rejects invalid dates, inverted ranges, and unknown inputs", () => {
    expect(() =>
      validateArguments("treasury", "debt-to-penny", { from: "2026-02-31" }),
    ).toThrow("date");
    expect(() =>
      validateArguments("treasury", "debt-to-penny", {
        from: "2026-09-01",
        to: "2026-08-01",
      }),
    ).toThrow("before");
    expect(() =>
      validateArguments("treasury", "debt-to-penny", {
        endpoint: "https://example.com",
      }),
    ).toThrow("Unknown input");
  });
  it("retains raw payload and normalizes live values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                { record_date: "2026-08-31", tot_pub_debt_out_amt: "123.50" },
              ],
            }),
          ),
      ),
    );
    const result = await invoke(
      debt.apiId,
      debt.operationId,
      debt.arguments,
      "live",
    );
    expect((result.rawResponse as any).data[0].tot_pub_debt_out_amt).toBe(
      "123.50",
    );
    expect(
      result.result.fields.find((f) => f.key === "tot_pub_debt_out_amt")?.type,
    ).toBe("currency");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("normalizes rate limits without silently substituting samples", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("", { status: 429, headers: { "Retry-After": "37" } }),
      ),
    );
    const store = useWorkspace();
    const w = await store.createWidget({ ...debt, mode: "live" });
    expect(w.error?.retryAfter).toBe(37);
    expect(w.status).toBe("error");
    expect(store.widgets[0].result).toBeUndefined();
  });
});
describe("workspace shared actions", () => {
  it("changes visualization without requesting or changing raw data", async () => {
    const store = useWorkspace();
    const w = await store.createWidget(debt);
    const raw = store.widgets[0].rawResponse;
    const resultId = store.widgets[0].result!.id;
    await store.transformWidget(w.id, { type: "table" }, 12);
    expect(store.widgets[0].rawResponse).toBe(raw);
    expect(store.widgets[0].result!.id).toBe(resultId);
    expect(store.widgets[0].width).toBe(12);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("completes a pending weather widget using the same ID", async () => {
    const store = useWorkspace();
    const w = await store.createWidget({
      apiId: "open-meteo",
      operationId: "forecast",
      arguments: {},
    });
    expect(w.status).toBe("needs-input");
    await store.updateWidget(w.id, {
      arguments: { latitude: 39.29, longitude: -76.61 },
    });
    expect(store.widgets[0].id).toBe(w.id);
    expect(store.widgets[0].status).toBe("ready");
  });
  it("invalidates data on argument changes even when reinvoke is false", async () => {
    const store = useWorkspace();
    const w = await store.createWidget(debt);
    await store.updateWidget(w.id, { arguments: { limit: 10 } }, false);
    expect(store.widgets[0].status).toBe("draft");
    expect(store.widgets[0].result).toBeUndefined();
    await store.refreshWidget(w.id);
    expect((store.widgets[0].result!.data as unknown[]).length).toBe(10);
  });
  it("prevalidates dashboard input to avoid partial insertion", async () => {
    const store = useWorkspace();
    await expect(
      store.createDashboard({
        title: "Invalid",
        widgets: [debt, { ...debt, arguments: { limit: -1 } }],
      }),
    ).rejects.toThrow();
    expect(store.widgets).toHaveLength(0);
    expect(store.title).toBe("Untitled workspace");
  });
  it("appends dashboards and round trips configuration without raw responses", async () => {
    const store = useWorkspace();
    await store.createWidget(debt);
    await store.createDashboard({ widgets: [debt] });
    expect(store.widgets).toHaveLength(2);
    const exported = JSON.parse(JSON.stringify(store.exportWorkspace()));
    expect(exported.widgets[0].rawResponse).toBeUndefined();
    await store.importWorkspace(exported);
    expect(store.widgets).toHaveLength(2);
    expect(store.widgets.every((w) => w.status === "ready")).toBe(true);
  });
  it("rejects bad imports before changing the workspace", async () => {
    const store = useWorkspace();
    await store.createWidget(debt);
    await expect(
      store.importWorkspace({
        version: 1,
        title: "Invalid",
        widgets: [{ ...debt, apiId: "arbitrary" }],
      }),
    ).rejects.toThrow();
    expect(store.widgets).toHaveLength(1);
  });
  it("does not resurrect a removed widget after a request settles", async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const store = useWorkspace();
    const pending = store.createWidget({ ...debt, mode: "live" });
    expect(store.widgets[0].status).toBe("loading");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    store.removeWidget(store.widgets[0].id);
    finish(new Response(JSON.stringify({ data: [] })));
    await expect(pending).rejects.toThrow("not found");
    expect(store.widgets).toHaveLength(0);
  });
  it("does not let an older request overwrite updated inputs", async () => {
    const finishes: ((r: Response) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => finishes.push(resolve))),
    );
    const store = useWorkspace();
    const first = store.createWidget({ ...debt, mode: "live" });
    const id = store.widgets[0].id;
    await vi.waitFor(() => expect(finishes[0]).toBeTypeOf("function"));
    const second = store.updateWidget(id, { arguments: { limit: 2 } });
    await vi.waitFor(() => expect(finishes[1]).toBeTypeOf("function"));
    finishes[1](
      new Response(
        JSON.stringify({
          data: [{ record_date: "2026-09-02", tot_pub_debt_out_amt: "200" }],
        }),
      ),
    );
    await second;
    finishes[0](
      new Response(
        JSON.stringify({
          data: [{ record_date: "2026-09-01", tot_pub_debt_out_amt: "100" }],
        }),
      ),
    );
    await first;
    expect((store.widgets[0].result!.data as any)[0].tot_pub_debt_out_amt).toBe(
      "200",
    );
  });
});
describe("WebMCP contracts", () => {
  it("preserves the original tools and exposes dashboard and generic data operations", () => {
    expect(contracts.length).toBeGreaterThanOrEqual(28);
    expect(new Set(contracts.map((c) => c.name)).size).toBe(contracts.length);
    expect(
      contracts.every((c) => c.schema.additionalProperties === false),
    ).toBe(true);
  });
  it("rejects extra fields, invalid nested inputs, and stale revision", async () => {
    const store = useWorkspace();
    const run = createToolRunner(store);
    expect(
      (await run("search_apis", { query: "", endpoint: "x" })).isError,
    ).toBe(true);
    expect((await run("create_widget", { ...debt, width: 7 })).isError).toBe(
      true,
    );
    expect(
      (await run("create_widget", { ...debt, expectedRevision: 99 })).isError,
    ).toBe(true);
    expect((await run("refresh_widgets", {})).isError).toBe(true);
    expect(store.widgets).toHaveLength(0);
  });
  it("executes every tool through the shared store", async () => {
    const store = useWorkspace();
    const run = createToolRunner(store);
    for (const [name, input] of [
      ["search_apis", { query: "debt" }],
      ["describe_api", debt],
      ["invoke_api", debt],
      ["create_widget", debt],
      ["create_dashboard", { widgets: [debt] }],
    ] as const) {
      const args =
        name === "describe_api"
          ? { apiId: debt.apiId, operationId: debt.operationId }
          : input;
      expect((await run(name, args)).isError, name).toBe(false);
    }
    const widgetId = store.widgets[0].id;
    for (const [name, input] of [
      ["get_workspace", {}],
      ["update_widget", { widgetId, patch: { title: "Updated" } }],
      ["transform_widget", { widgetId, presentation: "table" }],
      ["refresh_widget", { widgetId }],
      ["refresh_widgets", { scope: "all" }],
      ["export_workspace", {}],
      ["remove_widget", { widgetId }],
    ] as const)
      expect((await run(name, input)).isError, name).toBe(false);
    expect(store.widgets).toHaveLength(2);
    store.removeWidget(widgetId);
    expect(store.widgets).toHaveLength(1);
  });
  it("cancels before creating a widget", async () => {
    const store = useWorkspace();
    const run = createToolRunner(store);
    const c = new AbortController();
    c.abort();
    expect((await run("create_widget", debt, c.signal)).isError).toBe(true);
    expect(store.widgets).toHaveLength(0);
  });
});
