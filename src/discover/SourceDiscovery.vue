<script setup lang="ts">
import { ref } from "vue";
import ModalDialog from "../components/ModalDialog.vue";
import JsonBlock from "../blocks/JsonBlock.vue";
import {
  discoverSources,
  inspectSource,
  type SourceCandidate,
} from "../sources/discovery";
import {
  sourceFormats,
  type SourceFormat,
  type CustomApiConfig,
} from "../types";
import { useWorkspace } from "../stores/workspace";
const emit = defineEmits<{
  close: [];
  configure: [definition: CustomApiConfig];
}>();
const store = useWorkspace();
const query = ref(""),
  format = ref<SourceFormat>("auto"),
  selector = ref(""),
  permitted = ref(false),
  publicCatalog = ref(true),
  busy = ref(false),
  error = ref("");
const candidates = ref<SourceCandidate[]>([]),
  warnings = ref<string[]>([]),
  inspection = ref<Awaited<ReturnType<typeof inspectSource>>>();
let controller: AbortController | undefined;
async function inspect(url: string) {
  controller?.abort();
  controller = new AbortController();
  busy.value = true;
  error.value = "";
  inspection.value = undefined;
  try {
    inspection.value = await inspectSource(
      url,
      {
        format: format.value,
        selector: selector.value || undefined,
        permitted: permitted.value,
      },
      controller.signal,
    );
    candidates.value = inspection.value.candidates;
    warnings.value = inspection.value.warnings;
    if (inspection.value.status === "blocked")
      error.value = inspection.value.error.message;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function find() {
  if (/^https:\/\//i.test(query.value.trim()))
    return inspect(query.value.trim());
  busy.value = true;
  error.value = "";
  try {
    const result = await discoverSources(query.value, {
      publicCatalog: publicCatalog.value,
    });
    candidates.value = result.candidates;
    warnings.value = result.warnings;
    inspection.value = undefined;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function add() {
  if (inspection.value?.status !== "ready" || !inspection.value.configuration)
    return;
  busy.value = true;
  try {
    const saved = store.defineCustomApi(inspection.value.configuration);
    await store.createWidget({ ...saved, arguments: {}, mode: "live" });
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function configure(candidate?: SourceCandidate) {
  const config =
    candidate?.configuration ??
    (inspection.value?.status === "ready"
      ? inspection.value.configuration
      : undefined);
  if (config) emit("configure", config);
}
</script>
<template>
  <ModalDialog
    title="Discover a public source"
    wide
    @close="
      controller?.abort();
      emit('close');
    "
  >
    <p>
      Paste a public URL or search for a topic. Inspect the response before
      adding it to your dashboard.
    </p>
    <form class="source-search" @submit.prevent="find">
      <label class="stacked-field"
        >URL or topic<input
          v-model="query"
          aria-label="Source URL or topic"
          placeholder="https://… or a topic"
          required
          maxlength="1500" /></label
      ><button class="button primary" :disabled="busy">
        {{ busy ? "Inspecting…" : "Discover source" }}
      </button>
    </form>
    <div class="form-grid">
      <label
        >Format<select v-model="format">
          <option v-for="item in sourceFormats" :key="item" :value="item">
            {{ item }}
          </option>
        </select></label
      ><label
        >Table or script selector<input
          v-model="selector"
          placeholder="Optional CSS selector"
          maxlength="500"
      /></label>
    </div>
    <label class="check-label"
      ><input v-model="permitted" type="checkbox" />I have permission to read
      and reuse this webpage's structured data</label
    >
    <label class="check-label"
      ><input v-model="publicCatalog" type="checkbox" />Search the public
      APIs.guru directory for topic searches</label
    >
    <p class="tiny muted">
      Public APIs, CSV, XML, feeds, JSON-LD, HTML tables, and embedded JSON.
      Webpages must permit automated access. Browser access restrictions remain
      in effect.
    </p>
    <p v-if="error" role="alert" class="error-text">{{ error }}</p>
    <p v-for="warning in warnings" :key="warning" class="tiny muted">
      {{ warning }}
    </p>
    <section
      v-if="inspection?.status === 'ready'"
      aria-label="Source inspection"
    >
      <h3>
        {{ inspection.format }} · {{ inspection.kind }} ·
        {{ inspection.structure?.recordCount ?? 0 }} records
      </h3>
      <p class="tiny muted">
        Retrieved {{ new Date(inspection.retrievedAt).toLocaleString() }} ·
        {{ inspection.bytes }} bytes
      </p>
      <div class="source-fields">
        <span v-for="field in inspection.fields" :key="field.key"
          ><code>{{ field.key }}</code> {{ field.type }}</span
        >
      </div>
      <details open>
        <summary>Response preview</summary>
        <JsonBlock :value="inspection.sample" />
      </details>
      <div v-if="inspection.configuration" class="button-row">
        <button class="button primary" :disabled="busy" @click="add">
          Add source card</button
        ><button class="button" @click="configure()">
          Configure request and mappings
        </button>
      </div>
    </section>
    <ul class="source-candidates">
      <li v-for="candidate in candidates" :key="candidate.id">
        <h3>{{ candidate.title }}</h3>
        <p class="tiny">{{ candidate.url }}</p>
        <p>{{ candidate.reasons.join(" ") }}</p>
        <p class="tiny muted">
          {{ candidate.authentication }} authentication ·
          {{ candidate.access }} · {{ candidate.license }}
        </p>
        <div class="button-row">
          <button
            class="button"
            :disabled="busy"
            @click="
              query = candidate.url;
              inspect(candidate.url);
            "
          >
            Inspect source</button
          ><button
            v-if="candidate.configuration"
            class="button"
            @click="configure(candidate)"
          >
            Configure operation
          </button>
        </div>
      </li>
    </ul>
    <p v-if="!busy && !candidates.length && !inspection && query">
      No candidates yet. Try a more specific topic or paste a source URL.
    </p>
  </ModalDialog>
</template>
