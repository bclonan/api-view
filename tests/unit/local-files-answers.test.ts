import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspace } from "../../src/stores/workspace";
import { validateContent, contentIssues } from "../../src/runtime/content";
import {
  referenceForFile,
  resolveLocalFile,
  fileStates,
  localObjectUrl,
  releaseLocalUrl,
  isLocalObjectUrl,
  type ReadFileHandle,
} from "../../src/runtime/localFiles";
import { blockStyle, validateBlockStyle } from "../../src/runtime/blockStyle";
import { blockOutcome } from "../../src/runtime/outcomes";
import {
  answerQuestion,
  prepareSavedQuestion,
} from "../../src/workspace/insights";
import {
  shareState,
  encodeShare,
  decodeShare,
} from "../../src/workspace/share";
import { createToolRunner } from "../../src/webmcp/handlers";
import type { CanvasContent } from "../../src/types";
beforeEach(() => {
  setActivePinia(createPinia());
  fileStates.clear();
  const memory = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
  });
});
const fileCard: CanvasContent = {
  version: 1,
  kind: "file",
  title: "Local reference",
  files: [
    {
      id: "local-test",
      name: "data.csv",
      access: "reference",
      uri: "file:///private/data.csv",
    },
  ],
};
describe("local references through ordinary file cards", () => {
  it("keeps multiple metadata references, rejects unsafe schemes and duplicate IDs", () => {
    expect(() => validateContent(fileCard)).not.toThrow();
    expect(() =>
      validateContent({
        ...fileCard,
        files: [...fileCard.files!, ...fileCard.files!],
      }),
    ).toThrow(/unique/);
    expect(() =>
      validateContent({
        ...fileCard,
        files: [{ ...fileCard.files![0], uri: "javascript:alert(1)" }],
      }),
    ).toThrow();
    expect(() =>
      validateContent({
        ...fileCard,
        files: [{ ...fileCard.files![0], name: "../private.csv" }],
      }),
    ).toThrow();
  });
  it("saves CSV/JSON/text through existing device storage and exposes parsed values", async () => {
    const csv = await referenceForFile(
      new File(["name,count\nA,2\nB,4"], "data.csv", { type: "text/csv" }),
    );
    expect(csv.data).toHaveLength(2);
    expect(await (await resolveLocalFile(csv)).text()).toContain("B,4");
    const json = await referenceForFile(
      new File(['[{"count":2}]'], "data.json"),
    );
    expect(json.data).toEqual([{ count: 2 }]);
    const note = await referenceForFile(new File(["hello"], "note.md"));
    expect(note.data).toBe("hello");
    expect(fileStates.get(note.id)?.code).toBe("session_only");
  });
  it("reports invalid, oversized and unsupported previews without inventing data", async () => {
    const invalid = await referenceForFile(new File(["{"], "bad.json"));
    expect(invalid.previewIssue).toContain("could not be parsed");
    expect(invalid.data).toBeUndefined();
    const unsupported = await referenceForFile(
      new File(["binary"], "file.pdf", { type: "application/pdf" }),
    );
    expect(unsupported.previewIssue).toContain("No preview");
    const large = await referenceForFile(
      new File(["x".repeat(51000)], "large.txt"),
    );
    expect(large.data).toBeUndefined();
    await expect(
      referenceForFile(
        new File([new Uint8Array(21 * 1024 * 1024)], "large.mp4"),
      ),
    ).rejects.toThrow("20 MB");
  });
  it("never treats a path as read permission and reports missing references to WebMCP", async () => {
    await expect(resolveLocalFile(fileCard.files![0])).rejects.toThrow(
      "URI alone",
    );
    const store = useWorkspace(),
      card = store.createContent(fileCard);
    expect(card.outcome.issues.map((i) => i.code)).toContain(
      "local_file_unavailable",
    );
  });
  it("checks handles without requesting permission until the human asks, and detects changes", async () => {
    let file = new File(["old"], "original.txt", { lastModified: 1 });
    const handle: ReadFileHandle = {
      name: file.name,
      getFile: vi.fn(async () => file),
      queryPermission: vi.fn(async () => "prompt" as const),
      requestPermission: vi.fn(async () => "granted" as const),
    };
    const reference = await referenceForFile(file, handle);
    await expect(resolveLocalFile(reference)).rejects.toThrow("permission");
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect((await resolveLocalFile(reference, true)).name).toBe(file.name);
    file = new File(["changed"], "original.txt", { lastModified: 2 });
    await expect(resolveLocalFile(reference, true)).rejects.toThrow("changed");
    expect(fileStates.get(reference.id)?.code).toBe("local_file_changed");
  });
  it("allows only object URLs created here and releases them", () => {
    const url = localObjectUrl(new Blob(["image"]));
    expect(isLocalObjectUrl(url)).toBe(true);
    expect(isLocalObjectUrl("blob:https://example.org/forged")).toBe(false);
    releaseLocalUrl(url);
    expect(isLocalObjectUrl(url)).toBe(false);
  });
  it("preserves references/styles locally but removes file contents and paths from all shared envelopes", async () => {
    const store = useWorkspace();
    const card = store.createContent(
      {
        ...fileCard,
        files: [
          {
            ...fileCard.files![0],
            access: "snapshot",
            data: [{ privateValue: "private payload" }],
          },
        ],
      },
      "user",
      {
        presentation: {
          type: "file",
          props: { style: { background: "#fff4dd", fontSize: 18 } },
        },
      },
    );
    const exported = store.exportWorkspace();
    expect(JSON.stringify(exported)).toContain("private payload");
    const shared = decodeShare(encodeShare(shareState(store)));
    expect(JSON.stringify(shared)).not.toContain("private payload");
    expect(JSON.stringify(shared)).not.toContain("file:///private");
    expect(shared.widgets[0].presentation.props?.style?.fontSize).toBe(18);
    setActivePinia(createPinia());
    const restored = useWorkspace();
    await restored.importWorkspace(exported);
    expect(restored.getWidget(card.id).content?.files?.[0].uri).toContain(
      "file:///private",
    );
  });
  it("rejects arbitrary CSS and invalid styles in store and shared input", () => {
    expect(() =>
      validateBlockStyle({ background: "url(https://example.org)" }),
    ).toThrow();
    expect(() => validateBlockStyle({ fontSize: 100 })).toThrow();
    expect(blockStyle({ background: "url(https://example.org)" })).toEqual({});
    const store = useWorkspace();
    store.createContent(fileCard);
    const shared = shareState(store);
    shared.widgets[0].presentation.props = {
      style: { color: "expression(bad)" },
    };
    expect(() => decodeShare(encodeShare(shared))).toThrow();
  });
});
function setup() {
  const store = useWorkspace();
  const source = store.createContent({
    version: 1,
    kind: "dataset",
    title: "Counts",
    records: [
      { name: "A", count: 2 },
      { name: "B", count: 4 },
    ],
  });
  const question = store.createContent({
    version: 1,
    kind: "question",
    title: "Compare counts",
    question: "Compare counts",
    body: "Compare counts",
    sourceIds: [source.id],
  });
  const outputs = [
    {
      content: {
        version: 1,
        kind: "answer",
        title: "Comparison",
        body: "B has twice the count of A.",
        citations: [
          {
            blockId: source.id,
            path: "$",
            origin: "data",
            label: "Supplied counts",
          },
        ],
      } as CanvasContent,
    },
    {
      content: {
        version: 1,
        kind: "dataset",
        title: "Count table",
        records: [
          { name: "A", count: 2 },
          { name: "B", count: 4 },
        ],
      } as CanvasContent,
      presentation: { type: "table" as const },
    },
  ];
  return { store, source, question, outputs };
}
describe("question answers use existing content, revisions and bindings", () => {
  it("creates multiple normal blocks, keeps the question, and reuses deterministic IDs", async () => {
    const { store, source, question, outputs } = setup();
    expect(prepareSavedQuestion(store, question.id).scope).toEqual([source.id]);
    const submit = () =>
      answerQuestion(store, {
        questionBlockId: question.id,
        expectedRevision: store.revision,
        outputs,
      });
    const result = submit();
    expect(result.blocks).toHaveLength(2);
    expect(submit().blocks.map((b) => b.id)).toEqual(
      result.blocks.map((b) => b.id),
    );
    expect(store.widgets).toHaveLength(4);
    expect(store.getWidget(question.id).content?.kind).toBe("question");
    expect(
      store
        .getWorkspace()
        .widgets.find((w) => w.id === question.id)
        ?.outcome.issues.map((i) => i.code),
    ).not.toContain("awaiting_answer");
    const data = result.blocks[1];
    await store.updateWidget(
      data.id,
      { width: 12, position: 0, title: "Edited table" },
      false,
    );
    expect(store.widgets[0].title).toBe("Edited table");
    const run = createToolRunner(store);
    const derived = JSON.parse(
      (
        await run("create_derived_block", {
          sourceIds: [data.id],
          title: "Count",
          bindings: { value: { sourceId: data.id, path: "[1].count" } },
          presentation: { type: "metric" },
        })
      ).content[0].text,
    );
    expect(derived.ok).toBe(true);
    expect(store.resultForWidget(derived.data.id).result?.data).toEqual([
      { value: 4 },
    ]);
    expect(
      prepareSavedQuestion(store, question.id).context.blocks,
    ).toHaveLength(1);
    store.removeWidget(result.blocks[0].id);
    store.removeWidget(data.id);
    expect(
      blockOutcome(
        store.getWidget(question.id),
        store.resultForWidget(question.id),
      ).issues.map((i) => i.code),
    ).toContain("awaiting_answer");
  });
  it("prevalidates all outputs so a failed second output cannot leave a partial answer", () => {
    const { store, question, outputs } = setup();
    outputs[1].content.records = undefined;
    expect(() =>
      answerQuestion(store, {
        questionBlockId: question.id,
        expectedRevision: store.revision,
        outputs,
      }),
    ).toThrow(/records/);
    expect(store.widgets).toHaveLength(2);
  });
  it("rejects stale revisions, unknown scope and out-of-scope citations", () => {
    const { store, question, outputs } = setup();
    expect(() =>
      answerQuestion(store, {
        questionBlockId: question.id,
        expectedRevision: 0,
        outputs,
      }),
    ).toThrow();
    outputs[0].content.citations![0].blockId = "other";
    expect(() =>
      answerQuestion(store, {
        questionBlockId: question.id,
        expectedRevision: store.revision,
        outputs,
      }),
    ).toThrow(/selected cards/);
    expect(store.widgets).toHaveLength(2);
  });
  it("retains answer links and freshness checks through export/reload", async () => {
    const { store, question, source, outputs } = setup();
    const result = answerQuestion(store, {
      questionBlockId: question.id,
      expectedRevision: store.revision,
      outputs,
    });
    store.createContent(
      {
        ...store.getWidget(source.id).content!,
        records: [{ name: "A", count: 3 }],
      },
      "user",
      { blockId: source.id },
    );
    expect(
      contentIssues(store.getWidget(result.blocks[0].id), store.widgets)[0],
    ).toContain("changed");
    const exported = store.exportWorkspace();
    setActivePinia(createPinia());
    const restored = useWorkspace();
    await restored.importWorkspace(exported);
    expect(restored.getWidget(result.blocks[0].id).content?.answerTo).toBe(
      question.id,
    );
    expect(
      contentIssues(
        restored.getWidget(result.blocks[0].id),
        restored.widgets,
      )[0],
    ).toContain("changed");
  });
  it("exposes strict WebMCP validation and saved-question context", async () => {
    const { store, question, outputs } = setup();
    const run = createToolRunner(store);
    const call = async (name: string, value: unknown) =>
      JSON.parse((await run(name, value)).content[0].text);
    expect((await call("prepare_canvas_question", {})).ok).toBe(false);
    const prep = await call("prepare_canvas_question", {
      questionBlockId: question.id,
    });
    expect(prep.ok).toBe(true);
    expect(prep.data.answerBundleSchema.additionalProperties).toBe(false);
    expect(
      (
        await call("answer_canvas_question", {
          questionBlockId: question.id,
          expectedRevision: store.revision,
          outputs,
          execute: "bad",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await call("answer_canvas_question", {
          questionBlockId: question.id,
          expectedRevision: store.revision,
          outputs,
        })
      ).ok,
    ).toBe(true);
  });
});
