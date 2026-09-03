import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import { normalize, rowsOf } from "../../src/runtime/normalize";
import { inferStructure } from "../../src/runtime/structure";
import { blockOutcome } from "../../src/runtime/outcomes";
import { scenarioFor, scenarioKinds } from "../../src/runtime/scenarios";
import { compileCustomApi } from "../../src/api/custom";
import { restoreCustomApis } from "../../src/api/registry";
import { useWorkspace } from "../../src/stores/workspace";
import { createToolRunner } from "../../src/webmcp/handlers";
import { workspaceOutputSchema } from "../../src/webmcp/workspaceTools";
import { pageContext } from "../../src/workspace/context";
import {
  shareState,
  encodeShare,
  decodeShare,
} from "../../src/workspace/share";
import BlockRenderer from "../../src/blocks/BlockRenderer.vue";
import type { Operation, Widget, PresentationType } from "../../src/types";
import Ajv from "ajv";
import {
  teamFixture,
  scheduleFixture,
  placeFixture,
  newsFixture,
  eventFixture,
  personFixture,
  productFixture,
} from "../fixtures/scenarios";

const normalized = (raw: unknown) =>
  normalize(
    raw,
    {
      id: "generic",
      extract: (r: unknown) => inferStructure(r).data,
    } as Operation,
    "test",
    "sample",
  );
const widget = (data: unknown, type: PresentationType = "auto"): Widget => ({
  id: "test",
  title: "Test",
  invocation: {
    apiId: "test",
    operationId: "generic",
    arguments: {},
    mode: "sample",
  },
  presentation: { type },
  width: 6,
  status: "ready",
  missingInputs: [],
  createdAt: new Date().toISOString(),
  result: normalized(data),
});
const render = (data: unknown, type: PresentationType = "auto") =>
  renderToString(
    createSSRApp(BlockRenderer, {
      result: normalized(data),
      presentation: { type },
    }),
  );
const examples = [
  ["sports-score", scheduleFixture],
  ["sports-team", teamFixture],
  ["places", placeFixture],
  ["news", newsFixture],
  ["events", eventFixture],
  ["person", personFixture],
  ["product", productFixture],
] as const;

describe("scenario normalization and rendering", () => {
  it.each(examples)(
    "infers and renders %s without changing the raw payload",
    async (kind, raw) => {
      const original = JSON.stringify(raw),
        result = normalized(raw);
      expect(result.suggestedPresentations[0]).toBe(kind);
      expect(await render(raw)).toContain(`scenario-${kind}`);
      expect(JSON.stringify(raw)).toBe(original);
    },
  );
  it("extracts games instead of date wrappers and honors explicit response paths", () => {
    const result = normalized(scheduleFixture);
    expect(result.structure?.collectionPath).toBe("dates[].games[]");
    expect(rowsOf(result.data)[0]).toMatchObject({
      home_team: "Baltimore Orioles",
      away_score: 0,
      gamePk: 824312,
    });
    expect(inferStructure(scheduleFixture, "dates").data).toBe(
      scheduleFixture.dates,
    );
    expect(inferStructure({ dates: [] }).data).toEqual([]);
  });
  it("keeps team identity with record splits and does not chart season as a measure", () => {
    expect(normalized(teamFixture).data).toMatchObject({
      title: "Baltimore Ravens",
      record_summary: "3-0",
      home_record: "2-0",
      away_record: "1-0",
      losses: 0,
    });
    expect(normalized(scheduleFixture).measures).not.toContain("season");
  });
  it("maps competitor games and keeps absent scores absent", async () => {
    const raw = {
      events: [
        {
          date: "2026-09-03",
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { displayName: "Home" }, score: "0" },
                { homeAway: "away", team: { displayName: "Away" } },
              ],
            },
          ],
        },
      ],
    };
    const value = scenarioFor(rowsOf(normalized(raw).data)[0]).values;
    expect(value).toMatchObject({
      home_team: "Home",
      away_team: "Away",
      home_score: "0",
    });
    expect(value.away_score).toBeUndefined();
    expect(await render(raw)).toContain("Score not supplied");
    const w = widget(raw);
    expect(
      blockOutcome(w, { result: w.result, issues: [] }).issues.map(
        (i) => i.code,
      ),
    ).toContain("missing_scores");
  });
  it("handles address-only, invalid and zero coordinates without guessing", async () => {
    const address = await render(placeFixture, "map");
    expect(address).toContain("100 Example Street, Baltimore, MD");
    expect(address).toContain("Find address");
    expect(address).not.toContain("<iframe");
    expect(
      await render({ name: "Null island", latitude: 0, longitude: 0 }, "map"),
    ).toContain("marker=0,0");
    const w = widget({ ...placeFixture, latitude: 200, longitude: "" }, "map");
    expect(
      blockOutcome(w, { result: w.result, issues: [] }).issues.map(
        (i) => i.code,
      ),
    ).toContain("missing_coordinates");
  });
  it.each(scenarioKinds)(
    "keeps empty and incompatible %s data inspectable",
    async (kind) => {
      expect(await render([], kind)).toContain("No results this time");
      expect(
        await render([{ unfamiliar: { nested: ["value"] } }, null], kind),
      ).toContain("does not have the fields required");
      const w = widget([{ unfamiliar: true }], kind);
      expect(blockOutcome(w, { result: w.result, issues: [] }).status).toBe(
        "partial",
      );
    },
  );
  it("collapses nested fallback data and escapes untrusted fields", async () => {
    const html = await render(
      { title: "<script>bad()</script>", nested: { secretOfUniverse: [42] } },
      "record",
    );
    expect(html).toContain("<details");
    expect(html).not.toContain("<script>");
    expect(html).toContain("nested");
  });
});

beforeEach(() => {
  setActivePinia(createPinia());
  restoreCustomApis([]);
  const memory = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
  });
});
describe("WebMCP recovery and persistence", () => {
  const definition = {
    id: "custom-scenario-test",
    name: "Scenario test",
    baseUrl: "https://scenario.example.org",
    endpoint: "/data",
    method: "GET",
    sampleResponse: teamFixture,
  };
  it("returns a loading ID immediately and keeps the same ID when inspected again", async () => {
    let release!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const store = useWorkspace(),
      run = createToolRunner(store);
    await run("add_source", { definition });
    const response = JSON.parse(
      (
        await run("create_block", {
          sourceId: definition.id,
          mode: "live",
          waitForData: false,
        })
      ).content[0].text,
    );
    expect(response.status).toBe("loading");
    expect(response.data.id).toBeTruthy();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release(
      new Response(JSON.stringify(teamFixture), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await vi.waitFor(() => expect(store.widgets[0].status).toBe("ready"));
    const again = JSON.parse(
      (
        await run("create_block", {
          sourceId: definition.id,
          mode: "live",
          waitForData: true,
        })
      ).content[0].text,
    );
    expect(again.data.id).toBe(response.data.id);
    expect(store.widgets).toHaveLength(1);
  });
  it.each(["timeout", "network", "429", "403", "parse", "cancelled"])(
    "returns an actionable %s failure with the saved block ID",
    async (code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (code === "timeout")
            throw new DOMException("Timed out", "TimeoutError");
          if (code === "cancelled")
            throw new DOMException("Cancelled", "AbortError");
          if (code === "network") throw new TypeError("Failed to fetch");
          return new Response(
            code === "parse" ? "invalid json" : "Unavailable",
            {
              status: code === "parse" ? 200 : Number(code),
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "30",
              },
            },
          );
        }),
      );
      const store = useWorkspace(),
        run = createToolRunner(store);
      await run("add_source", { definition });
      const response = await run("create_block", {
        sourceId: definition.id,
        mode: "live",
      });
      expect(response.isError).toBe(true);
      const output = JSON.parse(response.content[0].text);
      expect(output.ok).toBe(false);
      expect(output.data.id).toBeTruthy();
      expect(output.error.recovery).toBeTruthy();
      expect(
        new Ajv({ strict: false, allowUnionTypes: true }).validate(
          workspaceOutputSchema,
          output,
        ),
      ).toBe(true);
      await run("create_block", { sourceId: definition.id, mode: "live" });
      expect(store.widgets).toHaveLength(1);
      const good = await run("create_block", {
        sourceId: definition.id,
        mode: "sample",
      });
      expect(good.isError).toBe(false);
      expect(store.widgets).toHaveLength(2);
      expect(store.getWorkspace().status).toBe("partial");
    },
  );
  it("reports failed inspection at the tool level", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("CORS");
      }),
    );
    const response = await createToolRunner(useWorkspace())(
      "test_data_source",
      { url: "https://unavailable.example.org" },
    );
    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text).error.code).toBe("network");
  });
  it("retains raw data, editable mapping and derived state in page context and share", async () => {
    const store = useWorkspace(),
      run = createToolRunner(store);
    await run("add_source", { definition });
    const created = JSON.parse(
      (await run("create_block", { sourceId: definition.id, mode: "sample" }))
        .content[0].text,
    ).data;
    const derived = await run("create_derived_block", {
      sourceIds: [created.id],
      presentation: { type: "sports-team" },
      bindings: {
        title: {
          sourceId: created.id,
          origin: "raw",
          path: "team.displayName",
        },
        wins: { sourceId: created.id, path: "wins" },
        losses: { sourceId: created.id, path: "losses" },
      },
    });
    expect(derived.isError).toBe(false);
    const context = pageContext(store);
    expect(context.blocks[0].rawData).toEqual(teamFixture);
    expect(context.blocks[1].outcome.status).toBe("ready");
    const restored = decodeShare(encodeShare(shareState(store)));
    expect(restored.widgets[1].presentation.type).toBe("sports-team");
    expect(restored.widgets[1].bindings?.title.path).toBe("team.displayName");
  });
  it("distinguishes loading, empty, stale and missing source data", () => {
    const w = widget([]);
    expect(blockOutcome(w, { result: w.result, issues: [] }).status).toBe(
      "empty",
    );
    w.status = "loading";
    expect(blockOutcome(w, { issues: [] }).next).toContain("independent");
    w.status = "ready";
    expect(blockOutcome(w, { issues: ["Source missing"] }).status).toBe(
      "blocked",
    );
    w.result = normalized(teamFixture);
    w.status = "error";
    w.error = { code: "timeout", title: "Timeout", message: "Try again" };
    expect(blockOutcome(w, { result: w.result, issues: [] })).toMatchObject({
      status: "partial",
      stale: true,
    });
  });
  it("compiles explicit mappings independently of the source hostname", () => {
    const { api } = compileCustomApi({
      ...definition,
      responsePath: "dates[].games[]",
      sampleResponse: scheduleFixture,
    });
    expect(
      normalize(scheduleFixture, api.operations[0], api.id, "sample")
        .suggestedPresentations[0],
    ).toBe("sports-score");
  });
});
