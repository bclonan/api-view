<script setup lang="ts">
import { computed, ref } from "vue";
import ModalDialog from "../components/ModalDialog.vue";
import { useWorkspace } from "../stores/workspace";
import type { CanvasContent, BlockStyle, LocalFileReference } from "../types";
import BlockStyleEditor from "../widgets/BlockStyleEditor.vue";
import { validateBlockStyle } from "../runtime/blockStyle";
import {
  referenceForFile,
  resolveLocalFile,
  fileStates,
  type ReadFileHandle,
} from "../runtime/localFiles";
import { validateContent } from "../runtime/content";
import { download } from "../runtime/download";
const props = defineProps<{ blockId?: string; kind?: CanvasContent["kind"] }>();
const emit = defineEmits<{ close: [] }>();
const store = useWorkspace();
const original = props.blockId
  ? store.getWidget(props.blockId).content
  : undefined;
const draft = ref<CanvasContent>(
  original
    ? JSON.parse(JSON.stringify(original))
    : {
        version: 1,
        kind: props.kind ?? "note",
        title: "",
        body: "",
        mediaType: "auto",
      },
);
const records = ref(JSON.stringify(draft.value.records ?? [], null, 2));
const citations = ref(JSON.stringify(draft.value.citations ?? [], null, 2));
const specText = ref("");
const error = ref("");
const picking = ref(false);
const localUri = ref("");
const customStyle = ref<BlockStyle>(
  props.blockId
    ? { ...store.getWidget(props.blockId).presentation.props?.style }
    : {},
);
const picker = (
  window as unknown as {
    showOpenFilePicker?: (options: {
      multiple: boolean;
    }) => Promise<ReadFileHandle[]>;
  }
).showOpenFilePicker;
async function attach(
  files: File[],
  handles?: ReadFileHandle[],
  index?: number,
) {
  picking.value = true;
  error.value = "";
  try {
    if (
      (draft.value.files?.length ?? 0) +
        (index === undefined ? files.length : 0) >
      8
    )
      throw new Error("Keep up to eight files on one card.");
    const refs: LocalFileReference[] = [];
    for (const [i, file] of files.entries())
      refs.push(await referenceForFile(file, handles?.[i]));
    const next = [...(draft.value.files ?? [])];
    if (index === undefined) next.push(...refs);
    else next.splice(index, 1, ...refs);
    draft.value.files = next;
    if (!draft.value.title) draft.value.title = files[0]?.name ?? "Local files";
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    picking.value = false;
  }
}
async function chooseHandles() {
  try {
    if (picker) {
      const handles = await picker.call(window, { multiple: true });
      await attach(await Promise.all(handles.map((h) => h.getFile())), handles);
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") error.value = (e as Error).message;
  }
}
async function refreshHandle(file: LocalFileReference, index: number) {
  try {
    const current = await resolveLocalFile(file, true);
    await attach([current], undefined, index);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function addUri() {
  try {
    const files = [
      ...(draft.value.files ?? []),
      {
        id: `local-${crypto.randomUUID()}`,
        name: localUri.value.split(/[\\/]/).at(-1) || "Local file",
        access: "reference" as const,
        uri: localUri.value,
      },
    ];
    validateContent({
      version: 1,
      kind: "file",
      title: draft.value.title || "Local files",
      files,
    });
    draft.value.files = files;
    localUri.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
const priceView = ref(
  props.blockId
    ? store.getWidget(props.blockId).presentation.type === "stock-chart"
    : false,
);
const sourceIds = ref(draft.value.sourceIds ?? []);
const availableSources = computed(() =>
  store.widgets.filter((w) => w.id !== props.blockId),
);
function payload(): CanvasContent {
  const value = {
    ...draft.value,
    sourceIds: sourceIds.value,
    citations: JSON.parse(citations.value),
  };
  if (["dataset", "search-results"].includes(value.kind))
    value.records = JSON.parse(records.value);
  else delete value.records;
  if (!value.url) delete value.url;
  if (value.kind !== "file") delete value.file;
  if (value.kind !== "file" || !value.files?.length) delete value.files;
  if (value.kind === "question") value.question = value.body;
  validateContent(value);
  return value;
}
function save() {
  try {
    validateBlockStyle(customStyle.value);
    const saved = store.createContent(payload(), "user", {
      blockId: props.blockId,
      key: props.blockId ? undefined : crypto.randomUUID(),
      presentation:
        draft.value.kind === "dataset" && priceView.value
          ? {
              ...(props.blockId
                ? store.getWidget(props.blockId).presentation
                : {}),
              type: "stock-chart",
            }
          : draft.value.kind === "dataset" &&
              props.blockId &&
              store.getWidget(props.blockId).presentation.type === "stock-chart"
            ? { type: "auto" }
            : undefined,
    });
    const widget = store.getWidget(saved.id);
    store.updateWidget(
      saved.id,
      {
        presentation: {
          props: { ...widget.presentation.props, style: customStyle.value },
        },
      },
      false,
    );
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function applySpec(value: unknown) {
  validateContent(value);
  draft.value = JSON.parse(JSON.stringify(value));
  records.value = JSON.stringify(value.records ?? [], null, 2);
  citations.value = JSON.stringify(value.citations ?? [], null, 2);
  sourceIds.value = value.sourceIds ?? [];
}
function applyJson() {
  try {
    applySpec(JSON.parse(specText.value));
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    if (file.size > 150000)
      throw new Error(
        "Choose a text file below 150 KB, or add its public URL.",
      );
    const text = await file.text();
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    if (!["txt", "md", "json", "csv"].includes(extension ?? ""))
      throw new Error(
        "Import TXT, Markdown, JSON or CSV. Use a public URL for other file types.",
      );
    if (extension === "json") {
      const value = JSON.parse(text);
      if (value?.version === 1 && value?.kind) {
        applySpec(value);
        return;
      }
      if (Array.isArray(value)) {
        applySpec({
          version: 1,
          kind: "dataset",
          title: file.name,
          records: value,
        });
        return;
      }
    }
    applySpec({
      version: 1,
      kind: "file",
      title: file.name,
      file: { name: file.name, format: extension, text },
    });
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function seedPrices() {
  draft.value.kind = "dataset";
  draft.value.title = "Illustrative price series";
  draft.value.body = "Demo fixture, not current market data.";
  priceView.value = true;
  records.value = JSON.stringify(
    [
      {
        time: "2025-01-02",
        symbol: "DEMO",
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
      },
      {
        time: "2025-01-03",
        symbol: "DEMO",
        open: 11,
        high: 13,
        low: 10,
        close: 12,
        volume: 140,
      },
    ],
    null,
    2,
  );
}
function exportSpec() {
  try {
    download("canvas-content.json", JSON.stringify(payload(), null, 2));
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <ModalDialog
    :title="blockId ? 'Edit content' : 'Add content'"
    @close="emit('close')"
  >
    <form class="content-editor" @submit.prevent="save">
      <p class="muted">
        Write a note, add an embed, or import content returned by an agent.
        Everything remains editable on this device.
      </p>
      <p v-if="error" role="alert" class="error-text">{{ error }}</p>
      <label
        >Content type<select v-model="draft.kind" aria-label="Content type">
          <option
            v-for="kind in [
              'note',
              'summary',
              'answer',
              'question',
              'search-results',
              'file',
              'dataset',
              'embed',
            ]"
            :key="kind"
            :value="kind"
          >
            {{ kind.replace("-", " ") }}
          </option>
        </select></label
      >
      <label
        >Title<input
          v-model="draft.title"
          aria-label="Content title"
          maxlength="120"
          required
      /></label>
      <label
        >{{ draft.kind === "question" ? "Question" : "Text"
        }}<textarea
          v-model="draft.body"
          aria-label="Content text"
          rows="5"
          maxlength="20000"
        />
      </label>
      <template v-if="['embed', 'file'].includes(draft.kind)"
        ><label
          >Public URL<input
            v-model="draft.url"
            aria-label="Content URL"
            type="url"
            placeholder="https://…" /></label
      ></template>
      <label v-if="draft.kind === 'embed'"
        >Player<select v-model="draft.mediaType" aria-label="Player type">
          <option value="auto">Detect from URL</option>
          <option value="video">Video file</option>
          <option value="audio">Audio file</option>
          <option value="iframe">External embed</option>
        </select></label
      >
      <template v-if="['dataset', 'search-results'].includes(draft.kind)"
        ><label
          >Structured rows<textarea
            v-model="records"
            aria-label="Content records"
            rows="8"
            spellcheck="false"
          /></label
        ><label v-if="draft.kind === 'dataset'" class="check-label"
          ><input type="checkbox" v-model="priceView" /> Stock chart, map time,
          open, high, low, close and optional volume</label
        ><button type="button" class="text-button" @click="seedPrices">
          Insert illustrative stock chart example
        </button></template
      >
      <template v-if="draft.kind === 'file'"
        ><fieldset>
          <legend>Local files</legend>
          <p class="tiny muted">
            Choose files to save copies on this device, or link originals in a
            supported browser. Paths alone cannot grant access. No files are
            uploaded.
          </p>
          <label
            >Choose local files<input
              type="file"
              multiple
              aria-label="Choose local files"
              :disabled="picking"
              @change="
                attach(
                  Array.from(($event.target as HTMLInputElement).files ?? []),
                )
              "
          /></label>
          <button
            v-if="picker"
            type="button"
            class="button"
            :disabled="picking"
            @click="chooseHandles"
          >
            Link original files
          </button>
          <div
            v-for="(file, index) in draft.files"
            :key="file.id"
            class="file-reference"
          >
            <span>{{ file.name }} · {{ file.access }}</span>
            <p
              v-if="fileStates.get(file.id)?.code === 'session_only'"
              class="notice"
            >
              {{ fileStates.get(file.id)?.message }}
            </p>
            <label
              >Reference URI<input
                v-model="file.uri"
                :aria-label="`Reference URI for ${file.name}`"
                @change="!file.uri && delete file.uri"
            /></label>
            <label
              >Reconnect file<input
                type="file"
                :aria-label="`Reconnect ${file.name}`"
                @change="
                  attach(
                    Array.from(($event.target as HTMLInputElement).files ?? []),
                    undefined,
                    index,
                  )
                "
            /></label>
            <button
              v-if="file.access === 'handle'"
              type="button"
              class="text-button"
              @click="refreshHandle(file, index)"
            >
              Save a copy of linked file
            </button>
            <button
              type="button"
              class="text-button"
              :aria-label="`Remove reference ${file.name}`"
              @click="draft.files?.splice(index, 1)"
            >
              Remove reference
            </button>
          </div>
          <label
            >Local reference or URI<input
              v-model="localUri"
              aria-label="Local reference or URI"
              placeholder="file:///path/to/file"
          /></label>
          <button type="button" class="button" @click="addUri">
            Add file reference
          </button>
        </fieldset>
        <button
          v-if="!draft.file"
          type="button"
          class="button"
          @click="draft.file = { name: 'notes.md', format: 'md', text: '' }"
        >
          Attach a text file</button
        ><template v-else
          ><label
            >Filename<input
              v-model="draft.file.name"
              aria-label="Content filename" /></label
          ><label
            >File format<select v-model="draft.file.format">
              <option
                v-for="format in ['txt', 'md', 'json', 'csv']"
                :key="format"
              >
                {{ format }}
              </option>
            </select></label
          ><label
            >File contents<textarea
              v-model="draft.file.text"
              aria-label="File contents"
              rows="8"
              maxlength="100000"
            /></label></template
      ></template>
      <fieldset v-if="availableSources.length">
        <legend>Related source cards</legend>
        <label
          v-for="card in availableSources"
          :key="card.id"
          class="check-label"
          ><input type="checkbox" :value="card.id" v-model="sourceIds" />{{
            card.title
          }}</label
        >
      </fieldset>
      <details>
        <summary>Source citations</summary>
        <p class="tiny muted">
          Each citation needs a label and a blockId or public URL. Add path and
          origin for a specific source field.
        </p>
        <textarea
          v-model="citations"
          aria-label="Content citations"
          rows="5"
          spellcheck="false"
        />
      </details>
      <details>
        <summary>Import or export an agent specification</summary>
        <label
          >Import content or text file<input
            type="file"
            accept=".json,.txt,.md,.csv"
            @change="importFile"
            aria-label="Import content file" /></label
        ><textarea
          v-model="specText"
          aria-label="Content specification"
          rows="6"
          placeholder="Paste a version 1 canvas content object"
        />
        <div class="button-row">
          <button type="button" class="button" @click="applyJson">
            Apply JSON to form</button
          ><button type="button" class="button" @click="exportSpec">
            Export content specification
          </button>
        </div>
      </details>
      <BlockStyleEditor v-model="customStyle" />
      <button class="button primary" type="submit" :disabled="picking">
        {{ picking ? "Reading files…" : "Save content" }}
      </button>
    </form>
  </ModalDialog>
</template>
<style scoped>
.content-editor {
  display: grid;
  gap: 14px;
  min-width: 0;
}
label {
  display: grid;
  gap: 5px;
  font-size: 13px;
  min-width: 0;
}
textarea {
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid #dce1d7;
  border-radius: 6px;
  resize: vertical;
}
fieldset {
  border: 1px solid #dce1d7;
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
}
.check-label {
  display: flex;
  align-items: center;
  gap: 8px;
}
details > * {
  margin-top: 10px;
}
button {
  justify-self: start;
}
</style>
