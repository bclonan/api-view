<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { LocalFileReference } from "../types";
import {
  fileStates,
  resolveLocalFile,
  localFileKind,
  localObjectUrl,
  releaseLocalUrl,
} from "../runtime/localFiles";
import { normalizeData } from "../runtime/normalize";
import BlockRenderer from "./BlockRenderer.vue";
import ValueRenderer from "../values/ValueRenderer.vue";
import EmbedBlock from "./EmbedBlock.vue";
const props = defineProps<{ file: LocalFileReference; readonly?: boolean }>();
const src = ref(""),
  error = ref(""),
  loading = ref(false);
let version = 0;
function clear() {
  if (src.value) releaseLocalUrl(src.value);
  src.value = "";
}
async function load(grant = false) {
  const current = ++version;
  clear();
  error.value = "";
  if (props.readonly) {
    error.value = "Local files are not included in shared views.";
    return;
  }
  loading.value = true;
  try {
    const file = await resolveLocalFile(props.file, grant);
    if (current === version) src.value = localObjectUrl(file);
  } catch (e) {
    if (current === version) error.value = (e as Error).message;
  } finally {
    if (current === version) loading.value = false;
  }
}
watch(
  () => [props.file, props.readonly],
  () => {
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  version++;
  clear();
});
const kind = computed(() => localFileKind(props.file));
const result = computed(() =>
  normalizeData(props.file.data, {
    apiId: "canvas-content",
    operationId: "content",
    mode: "live",
    invokedAt: new Date(props.file.lastModified ?? 0).toISOString(),
  }),
);
</script>
<template>
  <section class="local-preview" :aria-label="`Local file ${file.name}`">
    <h4>{{ file.name }}</h4>
    <p class="tiny muted">
      {{ file.mediaType || "Unknown file type"
      }}<template v-if="file.size !== undefined">
        · {{ file.size.toLocaleString() }} bytes</template
      >
      ·
      {{
        file.access === "handle"
          ? "Linked original"
          : file.access === "snapshot"
            ? "Saved copy"
            : "File reference"
      }}
    </p>
    <p v-if="loading" role="status">Reading local file…</p>
    <p v-if="error" role="status">{{ error }}</p>
    <button
      v-if="
        !readonly && fileStates.get(file.id)?.code === 'local_file_permission'
      "
      class="button"
      @click="load(true)"
    >
      Grant read access
    </button>
    <p
      v-if="!readonly && fileStates.get(file.id)?.code === 'session_only'"
      class="notice"
    >
      {{ fileStates.get(file.id)?.message }}
    </p>
    <template v-if="src">
      <ValueRenderer
        v-if="kind === 'image'"
        :value="src"
        semantic-type="image"
        :field-key="file.name"
        @unavailable="
          fileStates.set(file.id, {
            code: 'local_file_preview_failed',
            message:
              'This image could not be decoded. Choose a valid image or download the original.',
          })
        "
      />
      <EmbedBlock
        v-else-if="kind === 'video' || kind === 'audio'"
        :row="{ url: src }"
        :kind="kind"
        @issue="
          (issue) =>
            issue &&
            fileStates.set(file.id, {
              code: 'local_file_playback',
              message: issue.message,
            })
        "
      />
      <BlockRenderer
        v-else-if="file.data !== undefined"
        :result="result"
        :presentation="{
          type:
            typeof file.data === 'string'
              ? 'text'
              : Array.isArray(file.data)
                ? 'table'
                : 'record',
        }"
        readonly
      />
      <p v-if="file.previewIssue" class="notice">{{ file.previewIssue }}</p>
      <a :href="src" :download="file.name">Download {{ file.name }}</a>
      <template
        v-if="
          ['local_file_preview_failed', 'local_file_playback'].includes(
            fileStates.get(file.id)?.code ?? '',
          )
        "
      >
        <p role="status">{{ fileStates.get(file.id)?.message }}</p>
        <button class="button" @click="load()">Retry file preview</button>
      </template>
    </template>
    <p v-else-if="!readonly && !loading" class="tiny muted">
      Open Edit content to choose or reconnect this file.
    </p>
  </section>
</template>
<style scoped>
.local-preview {
  display: grid;
  gap: 10px;
  min-width: 0;
  border-top: 1px solid #dce1d7;
  padding-top: 12px;
}
h4,
p,
a {
  margin: 0;
  overflow-wrap: anywhere;
}
button {
  justify-self: start;
}
.local-preview :deep(.value-image) {
  max-height: 180px;
  max-width: 100%;
  width: auto;
  object-fit: contain;
}
</style>
