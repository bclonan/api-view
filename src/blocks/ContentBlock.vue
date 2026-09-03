<script setup lang="ts">
import { computed } from "vue";
import type { CanvasContent, Row } from "../types";
import { download } from "../runtime/download";
import { publicSourceUrl } from "../sources/security";
import LocalFilePreview from "./LocalFilePreview.vue";
import { useEditor } from "../stores/editor";
import { useWorkspace } from "../stores/workspace";
const props = defineProps<{
  content: Partial<CanvasContent>;
  row?: Row;
  kind?: string;
  readonly?: boolean;
  blockId?: string;
  answerTitles?: string[];
}>();
const body = computed(() =>
  String(props.content.body ?? props.row?.body ?? props.row?.text ?? ""),
);
const answers = computed(() =>
  props.readonly || !props.blockId
    ? (props.answerTitles ?? []).map((title) => ({ title }))
    : useWorkspace().widgets.filter(
        (w) => w.content?.answerTo === props.blockId,
      ),
);
function safe(value?: string) {
  try {
    return value ? publicSourceUrl(value).href : undefined;
  } catch {
    return undefined;
  }
}
function saveFile() {
  const file = props.content.file;
  if (file)
    download(
      file.name,
      file.text,
      file.format === "json"
        ? "application/json"
        : file.format === "csv"
          ? "text/csv"
          : "text/plain",
    );
}
</script>
<template>
  <section class="content-block">
    <p v-if="content.kind === 'question' && !answers.length" class="notice">
      Question saved for your WebMCP agent. Ask it to read this card's context
      and return a cited answer. This page does not run a language model itself.
    </p>
    <p v-if="answers.length" class="notice">
      {{ answers.length }} answer blocks:
      {{ answers.map((w) => w.title).join(", ") }}
    </p>
    <p
      v-if="content.question && content.kind !== 'question'"
      class="content-question"
    >
      {{ content.question }}
    </p>
    <div class="content-prose">{{ body }}</div>
    <button
      v-if="content.kind === 'question' && !readonly && blockId"
      class="button"
      @click="
        useEditor().questionBlockId = blockId;
        useEditor().questionScope = content.sourceIds ?? [];
      "
    >
      Open question and answers
    </button>
    <LocalFilePreview
      v-for="file in content.files"
      :key="file.id"
      :file="file"
      :readonly="readonly"
    />
    <template v-if="content.file">
      <button class="button" @click="saveFile">
        Download {{ content.file.name }}
      </button>
      <details>
        <summary>File preview</summary>
        <pre>{{ content.file.text }}</pre>
      </details>
    </template>
    <a
      v-if="safe(content.url)"
      :href="safe(content.url)"
      target="_blank"
      rel="noopener noreferrer"
      >{{ content.kind === "file" ? "Open file" : "Open source" }} ↗</a
    >
    <ol
      v-if="content.citations?.length"
      class="content-citations"
      aria-label="Citations"
    >
      <li v-for="(citation, index) in content.citations" :key="index">
        <a
          v-if="safe(citation.url)"
          :href="safe(citation.url)"
          target="_blank"
          rel="noopener noreferrer"
          >{{ citation.label }} ↗</a
        >
        <span v-else>{{ citation.label }}</span>
        <small v-if="citation.blockId">
          · {{ citation.blockId
          }}<template v-if="citation.path">
            · {{ citation.path }}</template
          ></small
        >
      </li>
    </ol>
    <p
      v-if="
        ['answer', 'summary'].includes(content.kind ?? '') &&
        !content.citations?.length
      "
      class="notice"
    >
      No supporting citations supplied. Treat this as uncited content.
    </p>
  </section>
</template>
<style scoped>
.content-block {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.content-prose {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.content-question {
  font-weight: 600;
}
.content-citations {
  padding-left: 20px;
  font-size: 12px;
}
li,
pre {
  overflow-wrap: anywhere;
}
small {
  color: #586550;
}
pre {
  white-space: pre-wrap;
  max-height: 300px;
  overflow: auto;
}
button {
  justify-self: start;
}
</style>
