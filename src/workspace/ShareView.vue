<script setup lang="ts">
import { computed } from "vue";
import { boundResult } from "../runtime/bindings";
import { decodeShare } from "./share";
import BlockRenderer from "../blocks/BlockRenderer.vue";
function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
const props = defineProps<{ encoded: string }>();
const snapshot = computed(() => {
  try {
    return { value: decodeShare(props.encoded), error: "" };
  } catch (e) {
    return { value: undefined, error: (e as Error).message };
  }
});
const blocks = computed(
  () =>
    snapshot.value.value?.widgets.map((w) => ({
      widget: w,
      ...boundResult(w, snapshot.value.value!.widgets),
    })) ?? [],
);
</script>
<template>
  <main class="share-page" aria-label="Shared workspace">
    <template v-if="snapshot.value">
      <header class="share-heading">
        <p class="eyebrow">API CANVAS · SHARED SNAPSHOT</p>
        <h1>{{ snapshot.value.title }}</h1>
        <p>
          Captured {{ new Date(snapshot.value.capturedAt).toLocaleString() }}.
          Data does not refresh in this view.
        </p>
      </header>
      <p
        v-for="warning in snapshot.value.warnings"
        :key="warning"
        class="notice"
      >
        {{ warning }}
      </p>
      <div class="workspace-grid">
        <article
          v-for="block in blocks"
          :key="block.widget.id"
          class="widget share-card"
          :style="{ '--widget-span': block.widget.width }"
          :aria-label="block.widget.title"
        >
          <h2>{{ block.widget.title }}</h2>
          <p class="tiny muted">
            {{
              block.widget.derived
                ? "Connected sources"
                : (snapshot.value.sources.find(
                    (s) => s.id === block.widget.invocation.apiId,
                  )?.name ?? block.widget.invocation.apiId)
            }}
            ·
            {{
              block.widget.invocation.mode === "sample"
                ? "Sample data"
                : "Live source snapshot"
            }}
          </p>
          <p v-for="issue in block.issues" :key="issue" class="notice">
            {{ issue }}
          </p>
          <BlockRenderer
            readonly
            v-if="block.result"
            :result="block.result"
            :presentation="block.widget.presentation"
          />
          <p v-else>
            {{
              block.widget.error?.message ??
              "No source response was available when this snapshot was created."
            }}
          </p>
          <footer
            v-if="snapshot.value.settings?.showProvenance"
            class="share-provenance"
          >
            <a
              v-if="safeUrl(block.widget.requestUrl)"
              :href="safeUrl(block.widget.requestUrl)!"
              target="_blank"
              rel="noopener noreferrer"
              >{{
                snapshot.value.sources.find(
                  (s) => s.id === block.widget.invocation.apiId,
                )?.name ?? block.widget.invocation.apiId
              }}</a
            >
            <span v-if="block.widget.refreshedAt"
              >Updated
              {{ new Date(block.widget.refreshedAt).toLocaleString() }}</span
            >
            <span
              v-for="source in [
                ...new Set(block.provenance.map((p) => p.sourceId)),
              ]"
              :key="source"
              >{{
                snapshot.value.widgets.find((w) => w.id === source)?.title ??
                source
              }}</span
            >
          </footer>
        </article>
      </div>
      <footer class="share-footer">
        Source definitions, connections, filters, and layout are included in
        this snapshot. <a href="/">Open API Canvas</a>
      </footer>
    </template>
    <p v-else role="alert">
      {{ snapshot.error }} <a href="/">Open API Canvas</a>
    </p>
  </main>
</template>
