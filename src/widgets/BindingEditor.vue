<script setup lang="ts">
import { computed, ref } from "vue";
import { useWorkspace } from "../stores/workspace";
import { discoverFields, flattenFields } from "../runtime/fields";
import { componentDefinitions } from "../blocks/definitions";
import type { Widget, DataBinding, DataTransform } from "../types";
const props = defineProps<{ widget: Widget }>();
const store = useWorkspace();
const sourceId = ref(props.widget.id);
const origin = ref<"data" | "raw">("data");
const slot = ref("value");
const path = ref("");
const label = ref("");
const fixed = ref(false);
const fixedText = ref("");
const bindings = ref<Record<string, DataBinding>>(
  JSON.parse(JSON.stringify(props.widget.bindings ?? {})),
);
const transformText = ref(
  JSON.stringify(props.widget.transforms ?? [], null, 2),
);
const error = ref("");
const sortField = ref("");
const direction = ref<"asc" | "desc">("desc");
const count = ref(10);
const selectedSource = computed(() =>
  store.widgets.find((w) => w.id === sourceId.value),
);
const fieldOptions = computed(() =>
  flattenFields(
    origin.value === "raw"
      ? discoverFields(selectedSource.value?.rawResponse, false)
      : (selectedSource.value?.result?.fieldTree ?? []),
  ),
);
const definition = computed(
  () =>
    componentDefinitions.find((d) => d.id === props.widget.presentation.type) ??
    componentDefinitions[0],
);
const dataFields = computed(
  () => store.resultForWidget(props.widget.id).result?.fields ?? [],
);
function addBinding() {
  const binding: DataBinding = fixed.value
    ? { literal: fixedText.value }
    : {
        sourceId:
          sourceId.value === props.widget.id ? undefined : sourceId.value,
        origin: origin.value,
        path: path.value,
      };
  if (label.value) binding.label = label.value;
  bindings.value = { ...bindings.value, [slot.value]: binding };
}
async function apply() {
  try {
    const transforms = JSON.parse(transformText.value) as DataTransform[];
    await store.updateWidget(props.widget.id, {
      bindings: bindings.value,
      transforms,
    });
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function addRowsRule() {
  try {
    const steps = JSON.parse(transformText.value) as DataTransform[];
    if (!Array.isArray(steps)) throw new Error("Transforms must be an array.");
    if (sortField.value)
      steps.push({
        op: "sort",
        field: sortField.value,
        direction: direction.value,
      });
    steps.push({ op: "limit", count: count.value });
    transformText.value = JSON.stringify(steps, null, 2);
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <section class="binding-editor" aria-label="Data bindings">
    <h3>Data bindings</h3>
    <p class="tiny muted">
      Choose which values fill this view. Leave bindings empty to use the
      original fields. Other widgets can supply values for a shared summary.
    </p>
    <div class="form-grid">
      <label
        >Slot<input
          v-model="slot"
          :list="`slots-${widget.id}`"
          aria-label="Binding slot"
          placeholder="value, title, population..."
      /></label>
      <datalist :id="`slots-${widget.id}`">
        <option
          v-for="item in definition.slots"
          :key="item.id"
          :value="item.id"
        >
          {{ item.name }}
        </option>
      </datalist>
      <label
        >Display label<input
          v-model="label"
          aria-label="Binding label"
          placeholder="Optional field label"
          maxlength="120"
      /></label>
      <label class="check-label"
        ><input v-model="fixed" type="checkbox" /> Use fixed text</label
      >
      <label v-if="fixed"
        >Text<input
          v-model="fixedText"
          aria-label="Binding text"
          maxlength="1000"
      /></label>
      <template v-else>
        <label
          >Source<select v-model="sourceId" aria-label="Binding source">
            <option
              v-for="source in store.widgets"
              :key="source.id"
              :value="source.id"
            >
              {{ source.title
              }}{{ source.id === widget.id ? " · this widget" : "" }}
            </option>
          </select></label
        >
        <label
          >Read from<select v-model="origin" aria-label="Binding origin">
            <option value="data">Normalized data</option>
            <option value="raw">Original response</option>
          </select></label
        >
        <label
          >Field path<input
            v-model="path"
            :list="`paths-${widget.id}`"
            aria-label="Binding path"
            placeholder="properties.mag or results[0].count"
        /></label>
        <datalist :id="`paths-${widget.id}`">
          <option value="$">Whole response</option>
          <option
            v-for="field in fieldOptions"
            :key="field.key"
            :value="
              origin === 'raw' ? field.key.replaceAll('[]', '[0]') : field.key
            "
          >
            {{ field.label }} · {{ field.type }}
          </option>
        </datalist>
      </template>
    </div>
    <p class="tiny muted">
      Use $data to select the dataset first. Paths in normalized data read each
      row of this widget, or the whole dataset of another widget. Use [0] to
      select its first row.
    </p>
    <button class="button" @click="addBinding">Add or replace binding</button>
    <ul class="binding-list">
      <li v-for="(binding, key) in bindings" :key="key">
        <code>{{ key }}</code
        ><span>{{
          Object.hasOwn(binding, "literal")
            ? binding.literal
            : `${binding.origin ?? "data"} · ${binding.path || "$"}`
        }}</span
        ><button
          class="text-button"
          :aria-label="`Remove ${key} binding`"
          @click="delete bindings[key]"
        >
          Remove
        </button>
      </li>
    </ul>
    <h3>Rows</h3>
    <div class="form-grid">
      <label
        >Sort field<select v-model="sortField" aria-label="Sort field">
          <option value="">Keep source order</option>
          <option
            v-for="field in dataFields"
            :key="field.key"
            :value="field.key"
          >
            {{ field.label }}
          </option>
        </select></label
      >
      <label
        >Direction<select v-model="direction">
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select></label
      >
      <label
        >Result limit<input
          v-model.number="count"
          type="number"
          min="1"
          max="5000"
      /></label>
    </div>
    <button class="button" @click="addRowsRule">Add row rule</button>
    <details>
      <summary>Transform steps</summary>
      <p class="tiny muted">
        JSON steps run before slot bindings. Supported operations: select,
        rename, filter, sort, limit, map, derive, aggregate, group, flatten,
        merge, join. No code runs here.
      </p>
      <textarea
        v-model="transformText"
        aria-label="Transform steps JSON"
        rows="7"
        spellcheck="false"
      ></textarea>
      <p class="tiny muted">
        Example:
        [{"op":"filter","field":"magnitude","comparison":"gte","value":4},{"op":"sort","field":"time","direction":"desc"},{"op":"limit","count":10}]
      </p>
    </details>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <div class="button-row">
      <button class="button primary" @click="apply">Apply data settings</button
      ><button
        class="text-button"
        @click="
          bindings = {};
          transformText = '[]';
          apply();
        "
      >
        Reset data settings
      </button>
    </div>
  </section>
</template>
