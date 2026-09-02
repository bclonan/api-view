import { beforeEach, describe, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { normalize } from "../../src/runtime/normalize";
import { inferStructure } from "../../src/runtime/structure";
import { compatibleComponents } from "../../src/blocks/definitions";
import { useWorkspace } from "../../src/stores/workspace";
import { createToolRunner } from "../../src/webmcp/handlers";
import type { Operation } from "../../src/types";
import { planIntent } from "../../src/workspace/intent";
import { apis } from "../../src/api/registry";
import { validateArguments } from "../../src/runtime/invoke";
const generic = { id: "test" } as Operation;
beforeEach(() => {
  setActivePinia(createPinia());
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
});
describe("semantic foundation", () => {
  it("leaves a retryable card when a planned live request fails", async () => {
    const store = useWorkspace();
    store.mode = "live";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const result = await createToolRunner(store)("execute_goal", {
      prompt: "Find Monet paintings",
    });
    expect(JSON.parse(result.content[0].text).status).toBe("partial");
    expect(store.widgets).toHaveLength(1);
    expect(store.widgets[0]).toMatchObject({
      status: "error",
      invocation: { apiId: "artic", arguments: { q: "Monet" } },
      error: { code: "network" },
    });
  });
  it("accepts an hourly weather response without temperature when other variables were requested", () => {
    const operation = apis.find((a) => a.id === "open-meteo")!.operations[0];
    const result = normalize(
      {
        hourly: { time: ["2026-09-02T12:00"], precipitation_probability: [20] },
      },
      operation,
      "open-meteo",
      "live",
    );
    expect(result.data).toEqual([
      { time: "2026-09-02T12:00", precipitation_probability: 20 },
    ]);
  });
  it("maps Hacker News feed names without treating the word News as new", () => {
    expect(
      planIntent("Show top Hacker News stories").steps[0].params.feed,
    ).toBe("top");
    expect(
      planIntent("Show new Hacker News stories").steps[0].params.feed,
    ).toBe("new");
    expect(
      planIntent("Show best Hacker News stories").steps[0].params.feed,
    ).toBe("best");
  });
  it("does not treat numeric identifiers or publication years as chart measures", () => {
    const result = normalize(
      [
        { id: 120, publication_year: 2025 },
        { id: 121, publication_year: 2026 },
      ],
      generic,
      "unknown",
      "sample",
    );
    expect(
      compatibleComponents(result).find((c) => c.id === "histogram")
        ?.compatible,
    ).toBe(false);
  });
  it("keeps historical debt distinct from archive media and maps state names to geography IDs", () => {
    expect(
      planIntent("Show historical federal debt").steps.map((s) => s.sourceId),
    ).toEqual(["treasury"]);
    const plan = planIntent(
      "Compare population in West Virginia, Maryland and Pennsylvania for 2023",
    );
    expect(plan.questions).toEqual([]);
    expect(plan.steps.map((s) => s.params.state).sort()).toEqual([
      "04000US24",
      "04000US42",
      "04000US54",
    ]);
    expect(planIntent("Show population in France").questions).not.toHaveLength(
      0,
    );
  });
  it("preserves graph nodes and edges as one dataset", () => {
    const raw = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ source: "a", target: "b" }],
    };
    const result = normalize(raw, generic, "unknown", "sample");
    expect(result.data).toEqual(raw);
    expect(compatibleComponents(result)[0]).toMatchObject({
      id: "graph",
      compatible: true,
    });
  });
  it("maps a currency pair to the current provider query", () => {
    const operation = apis.find((a) => a.id === "frankfurter")!.operations[0];
    const url = new URL(operation.buildUrl({ base: "USD", quote: "EUR" }));
    expect(url.searchParams.get("quotes")).toBe("EUR");
    expect(url.searchParams.has("quote")).toBe(false);
  });
  it.each(
    apis
      .filter((a) => !a.id.startsWith("custom-"))
      .flatMap((api) =>
        api.operations.map((operation) => ({ api, operation })),
      ),
  )(
    "normalizes $api.id/$operation.id and offers a compatible view",
    ({ api, operation }) => {
      const args = validateArguments(
        api.id,
        operation.id,
        operation.capability?.examples[0]?.arguments ?? {},
      ).args;
      const result = normalize(
        operation.sample(args),
        operation,
        api.id,
        "sample",
      );
      expect(result.fields.length).toBeGreaterThan(0);
      expect(
        compatibleComponents(result).some((c) => c.compatible && c.score > 0),
      ).toBe(true);
    },
  );
  it("maps date ranges, subjects and coordinates without inventing unknown inputs", () => {
    const plan = planIntent(
      "Show magnitude 5+ earthquakes from the last week.",
      new Date("2026-09-02T12:00:00Z"),
    );
    expect(plan.steps[0]).toMatchObject({
      sourceId: "usgs",
      params: {
        minmagnitude: 5,
        starttime: "2026-08-26",
        endtime: "2026-09-02",
      },
      presentation: "map",
    });
    expect(planIntent("Find Monet paintings").steps[0]).toMatchObject({
      sourceId: "artic",
      params: { q: "Monet" },
    });
    expect(
      planIntent("Find recent papers about WebMCP").steps[0],
    ).toMatchObject({ sourceId: "crossref", params: { query: "WebMCP" } });
    expect(planIntent("Show the weather").questions.length).toBeGreaterThan(0);
    expect(
      planIntent("Compare aspirin and ibuprofen")
        .steps.filter((s) => s.sourceId === "pubchem")
        .map((s) => s.params.name),
    ).toEqual(["aspirin", "ibuprofen"]);
  });
  it("completes the flagship goal and reuses responses for its follow-up", async () => {
    const store = useWorkspace(),
      run = createToolRunner(store),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await run("execute_goal", {
      prompt:
        "Build me an earthquake research dashboard. Map magnitude 5+ earthquakes from the past week, find recent research about earthquakes, identify the largest earthquake and add its local weather. Pick appropriate views and arrange everything clearly.",
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text).status).toBe("complete");
    expect(store.widgets.map((w) => w.invocation.apiId)).toEqual([
      "usgs",
      "crossref",
      "open-meteo",
    ]);
    const firstId = store.widgets[0].result?.id;
    const edit = await run("execute_goal", {
      prompt:
        "Duplicate the earthquake data as a histogram, make the papers a table showing only title, authors, publication year and DOI, and move the weather beside the map.",
    });
    expect(edit.isError).toBe(false);
    expect(store.widgets).toHaveLength(4);
    expect(store.widgets.some((w) => w.presentation.type === "histogram")).toBe(
      true,
    );
    expect(
      store.widgets.find((w) => w.invocation.apiId === "crossref")?.presentation
        .fields,
    ).toEqual(["title", "authors", "publication_year", "DOI"]);
    expect(store.widgets[0].result?.id).toBe(firstId);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("unwraps an unknown collection and keeps semantic evidence distinct from primitive types", () => {
    const raw = {
      message: {
        items: [
          {
            title: "Paper",
            DOI: "10.1234/example",
            image_id: "abc",
            temperature: 20,
          },
          {
            title: "Other",
            DOI: "10.1234/other",
            image_id: "xyz",
            temperature: 22,
          },
        ],
      },
    };
    const result = normalize(raw, generic, "unrelated", "sample");
    expect(result.structure?.collectionPath).toBe("message.items");
    expect(result.fields.find((f) => f.key === "image_id")).toMatchObject({
      primitiveType: "string",
      semanticType: "identifier",
    });
    expect(result.fields.find((f) => f.key === "temperature")).toMatchObject({
      primitiveType: "integer",
      semanticType: "temperature",
    });
    expect(
      compatibleComponents(result).find((c) => c.id === "gallery")?.compatible,
    ).toBe(false);
    expect(
      compatibleComponents(result).find((c) => c.id === "document")?.compatible,
    ).toBe(true);
  });
  it("supports arbitrary GeoJSON points without modifying the response", () => {
    const raw = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { title: "Point", mag: 5.2, time: 1788300000000 },
          geometry: { type: "Point", coordinates: [-76.6, 39.3, 12] },
        },
      ],
    };
    const before = JSON.stringify(raw),
      result = normalize(raw, generic, "unknown", "sample");
    expect(compatibleComponents(result)[0]).toMatchObject({
      id: "map",
      compatible: true,
      score: 100,
    });
    expect((result.data as any)[0]).toMatchObject({
      longitude: -76.6,
      latitude: 39.3,
      depth: 12,
    });
    expect(JSON.stringify(raw)).toBe(before);
  });
  it("rejects incompatible hints and detects mixed fields from several rows", () => {
    const result = normalize(
      [{ value: "not a number" }, { value: 10 }],
      { ...generic, hints: { value: "currency" } },
      "unknown",
      "sample",
    );
    expect(result.fields[0]).toMatchObject({
      primitiveType: "mixed",
      type: "unknown",
    });
    expect(
      compatibleComponents(result).find((c) => c.id === "metric")?.compatible,
    ).toBe(false);
    expect(inferStructure({ title: "Color", rgb: [1, 2, 3] }).data).toEqual({
      title: "Color",
      rgb: [1, 2, 3],
    });
  });
  it("runs once and composes two cards without fetching or copying raw data into the export", async () => {
    const store = useWorkspace(),
      run = createToolRunner(store),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await run("run_api", {
      sourceId: "usgs",
      capabilityId: "recent",
      params: {},
      mode: "sample",
    });
    const data = JSON.parse(response.content[0].text);
    expect(response.isError).toBe(false);
    expect(store.widgets).toHaveLength(0);
    const card = await run("add_card", {
      envelopeId: data.envelopeId,
      presentation: { type: "map" },
    });
    expect(card.isError).toBe(false);
    await run("duplicate_card", {
      cardId: store.widgets[0].id,
      presentation: { type: "histogram" },
    });
    expect(store.widgets).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
    expect(store.widgets[0].rawResponse).toEqual(store.widgets[1].rawResponse);
    expect(JSON.stringify(store.exportWorkspace())).not.toContain(
      "rawResponse",
    );
    await run("select_cards", { cardIds: [store.widgets[1].id] });
    expect(
      (await run("update_card", { presentation: { type: "table" } })).isError,
    ).toBe(false);
    expect(store.widgets[1].presentation.type).toBe("table");
  });
});
