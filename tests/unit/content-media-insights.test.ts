import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import { useWorkspace } from "../../src/stores/workspace";
import { restoreCustomApis } from "../../src/api/registry";
import { validateContent, contentIssues } from "../../src/runtime/content";
import { embedSource } from "../../src/runtime/embeds";
import { pricePoint } from "../../src/runtime/market";
import { blockOutcome } from "../../src/runtime/outcomes";
import { createToolRunner } from "../../src/webmcp/handlers";
import { pageContext } from "../../src/workspace/context";
import { prepareQuestion, summarizeCanvas } from "../../src/workspace/insights";
import {
  encodeShare,
  decodeShare,
  shareState,
} from "../../src/workspace/share";
import BlockRenderer from "../../src/blocks/BlockRenderer.vue";
import type { CanvasContent } from "../../src/types";

const note: CanvasContent = {
  version: 1,
  kind: "note",
  title: "Notes",
  body: "User supplied notes",
};
const dataset: CanvasContent = {
  version: 1,
  kind: "dataset",
  title: "Illustrative prices",
  records: [
    {
      date: "2026-09-01",
      symbol: "DEMO",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
      currency: "USD",
    },
    {
      date: "2026-09-02",
      symbol: "DEMO",
      open: 11,
      high: 14,
      low: 10,
      close: 13,
      volume: 200,
      currency: "USD",
    },
  ],
};
beforeEach(() => {
  vi.unstubAllGlobals();
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
      throw new Error("Local content must not fetch an API");
    }),
  );
});

describe("content contract and media", () => {
  it.each([
    { ...note, extra: true },
    { ...note, body: "" },
    { version: 1, kind: "dataset", title: "Missing rows" },
    { ...note, kind: "embed", url: "javascript:alert(1)" },
    { ...note, kind: "embed", url: "https://127.0.0.1/private" },
    {
      ...note,
      kind: "file",
      file: { name: "run.html", format: "txt", text: "<script>bad()</script>" },
    },
    {
      ...note,
      kind: "file",
      file: { name: "bad.json", format: "json", text: "{" },
    },
    { ...note, citations: [{ label: "No evidence" }] },
    { ...note, body: "x".repeat(20001) },
  ])("rejects invalid content %#", (value) =>
    expect(() => validateContent(value)).toThrow(),
  );
  it("accepts empty search results without manufacturing entries", () => {
    const store = useWorkspace();
    const card = store.createContent(
      { version: 1, kind: "search-results", title: "No results", records: [] },
      "agent",
    );
    expect(store.resultForWidget(card.id).result?.data).toEqual([]);
    expect(card.outcome.status).toBe("empty");
  });
  it("canonicalizes providers, respects player choice, rejects unsafe URLs", () => {
    expect(embedSource({ url: "https://youtu.be/jfKfPfyJRdk" })).toMatchObject({
      kind: "iframe",
      src: "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk",
    });
    expect(embedSource({ url: "https://vimeo.com/123456" })).toMatchObject({
      src: "https://player.vimeo.com/video/123456",
    });
    expect(
      embedSource({ url: "https://open.spotify.com/track/abc123" }),
    ).toMatchObject({ provider: "Spotify" });
    expect(embedSource({ url: "https://example.org/clip.webm" })).toMatchObject(
      { kind: "video" },
    );
    expect(embedSource({ url: "https://example.org/song.mp3" })).toMatchObject({
      kind: "audio",
    });
    expect(
      embedSource({
        url: "https://example.org/clip.webm",
        mediaType: "iframe",
      }),
    ).toMatchObject({ kind: "iframe", trusted: false });
    expect(embedSource({ url: "https://localhost/private" }).kind).toBe(
      "invalid",
    );
    expect(embedSource({ url: "https://youtube.com/watch?v=bad" }).kind).toBe(
      "invalid",
    );
  });
  it("renders notes as text and keeps provider frames unloaded", async () => {
    const store = useWorkspace();
    const n = store.createContent({ ...note, body: "<script>bad()</script>" });
    const w = store.getWidget(n.id);
    const html = await renderToString(
      createSSRApp(BlockRenderer, {
        result: w.result!,
        presentation: w.presentation,
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    const e = store.createContent({
      version: 1,
      kind: "embed",
      title: "Video",
      url: "https://youtu.be/jfKfPfyJRdk",
    });
    const ew = store.getWidget(e.id);
    const player = await renderToString(
      createSSRApp(BlockRenderer, {
        result: ew.result!,
        presentation: ew.presentation,
      }),
    );
    expect(player).toContain("Load embed");
    expect(player).not.toContain("<iframe");
    expect(e.outcome.issues.map((i) => i.code)).toContain("embed_unverified");
    store.setViewError(e.id, {
      code: "playback",
      title: "Playback unavailable",
      message: "Codec unsupported",
    });
    expect(
      blockOutcome(ew, store.resultForWidget(e.id)).issues.find(
        (i) => i.code === "playback",
      )?.retryable,
    ).toBe(true);
  });
  it("keeps zero prices, validates dates and does not invent OHLC", () => {
    expect(pricePoint({ date: "2026-09-02", close: 0 })).toMatchObject({
      close: 0,
      ohlc: false,
    });
    expect(
      pricePoint({ date: "2026-09-02", close: null }).close,
    ).toBeUndefined();
    expect(pricePoint({ date: "2026-02-30", close: 2 }).time).toBeUndefined();
    expect(pricePoint({ date: "2", close: 2 }).time).toBeUndefined();
    expect(pricePoint({ timestamp: 1788307200, close: 2 }).time).toBeTruthy();
    expect(
      pricePoint({ date: "2026-09-02", open: 10, close: 11, low: 12, high: 13 })
        .ohlc,
    ).toBe(false);
  });
});

describe("editable content, bindings and evidence", () => {
  it("edits, duplicates and restores content without requests", async () => {
    const store = useWorkspace();
    const card = store.createContent(note, "agent", { key: "stable-note" });
    expect(store.createContent(note, "agent", { key: "stable-note" }).id).toBe(
      card.id,
    );
    await store.updateWidget(card.id, {
      title: "Renamed",
      presentation: { type: "note" },
      width: 12,
    });
    expect(store.getWidget(card.id).content?.title).toBe("Renamed");
    const copy = await store.duplicateCard(card.id);
    expect(copy.id).not.toBe(card.id);
    const exported = store.exportWorkspace();
    setActivePinia(createPinia());
    const restored = useWorkspace();
    await restored.importWorkspace(exported);
    expect(restored.widgets).toHaveLength(2);
    expect(restored.widgets[0].content?.body).toBe(note.body);
    expect(restored.widgets[0].width).toBe(12);
    expect(restored.widgets[0].result?.metadata.canvasContent).toMatchObject({
      title: "Renamed",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("updates derived local data and flags answers tied to changed or removed evidence", async () => {
    const store = useWorkspace(),
      run = createToolRunner(store);
    const source = store.createContent(dataset);
    const response = JSON.parse(
      (
        await run("create_derived_block", {
          sourceIds: [source.id],
          title: "Latest close",
          presentation: { type: "metric" },
          bindings: { value: { sourceId: source.id, path: "[1].close" } },
        })
      ).content[0].text,
    );
    expect(response.ok).toBe(true);
    const derived = store.getWidget(response.data.id);
    expect(store.resultForWidget(derived.id).result?.data).toMatchObject([
      {
        value: 13,
      },
    ]);
    const answer = store.createContent(
      {
        version: 1,
        kind: "answer",
        title: "Answer",
        body: "The last supplied close is 13.",
        sourceIds: [derived.id],
        citations: [
          { blockId: derived.id, path: "[0].value", label: "Latest close" },
        ],
      },
      "agent",
    );
    expect(contentIssues(store.getWidget(answer.id), store.widgets)).toEqual(
      [],
    );
    expect(() =>
      store.createContent({
        ...note,
        citations: [{ blockId: source.id, path: "missing", label: "Missing" }],
      }),
    ).toThrow(/unavailable/);
    store.createContent(
      {
        ...dataset,
        records: [
          ...dataset.records!.slice(0, 1),
          { ...dataset.records![1], close: 14 },
        ],
      },
      "user",
      { blockId: source.id },
    );
    expect(store.resultForWidget(derived.id).result?.data).toMatchObject([
      {
        value: 14,
      },
    ]);
    expect(
      contentIssues(store.getWidget(answer.id), store.widgets)[0],
    ).toContain("changed");
    await store.updateWidget(derived.id, { title: "New derived title" });
    const snapshot = decodeShare(encodeShare(shareState(store)));
    expect(
      contentIssues(
        snapshot.widgets.find((w) => w.id === answer.id)!,
        snapshot.widgets,
      )[0],
    ).toContain("changed");
    store.removeWidget(derived.id);
    expect(
      contentIssues(store.getWidget(answer.id), store.widgets)[0],
    ).toContain("removed");
  });
  it("scopes questions and summaries to visible source data with citations", async () => {
    const store = useWorkspace();
    const p = store.createContent(dataset);
    store.createContent(note);
    await store.updateWidget(p.id, {
      presentation: { type: "table", props: { filter: "2026-09-02" } },
    });
    const q = prepareQuestion(store, "What is the supplied close?", [p.id]);
    expect(q.context.blocks).toHaveLength(1);
    expect(q.context.blocks[0].visibleData).toEqual([dataset.records![1]]);
    const summary = summarizeCanvas(store, [p.id]);
    expect(summary.body).toContain("1 visible records");
    expect(summary.body).toContain("Open: 1 supplied values, min 11, max 11");
    expect(summary.citations?.[0].blockId).toBe(p.id);
    expect(() => prepareQuestion(store, "Question", ["removed"])).toThrow(
      /removed/,
    );
    const context = pageContext(store, 1);
    expect(context.warnings.length).toBeGreaterThan(0);
    expect(context.blocks[0].data).toHaveLength(1);
  });
  it("validates WebMCP schemas, revisions and pending answer states", async () => {
    const store = useWorkspace(),
      run = createToolRunner(store);
    const call = async (name: string, args: unknown) =>
      JSON.parse((await run(name, args)).content[0].text);
    expect((await call("get_content_spec", {})).ok).toBe(true);
    expect(
      (await call("create_content_block", { content: note, unexpected: true }))
        .ok,
    ).toBe(false);
    const created = await call("create_content_block", {
      content: { ...note, kind: "question" },
      key: "q",
    });
    expect(created.data.outcome.issues.map((i: any) => i.code)).toContain(
      "awaiting_answer",
    );
    expect(
      (
        await call("update_content_block", {
          blockId: created.data.id,
          content: note,
          expectedRevision: store.revision - 1,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await call("update_content_block", {
          blockId: created.data.id,
          content: { ...note, kind: "answer" },
          expectedRevision: store.revision,
        })
      ).data.outcome.issues.map((i: any) => i.code),
    ).toContain("uncited_content");
    const src = store.createContent(dataset);
    const result = await call("summarize_canvas", { blockIds: [src.id] });
    expect(result.ok).toBe(true);
    expect(store.getWidget(result.data.id).contentMeta?.origin).toBe(
      "computed",
    );
  });
});
