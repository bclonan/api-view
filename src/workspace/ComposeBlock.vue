<script setup lang="ts">
import { computed, ref } from "vue";
import { useWorkspace } from "../stores/workspace";
import ModalDialog from "../components/ModalDialog.vue";
import JsonBlock from "../blocks/JsonBlock.vue";
import {
  presentations,
  type PresentationType,
  type DataBinding,
  type DataTransform,
  type TaggedField,
} from "../types";
import { readPath } from "../runtime/fields";
const emit = defineEmits<{ close: [] }>();
const store = useWorkspace();
const sourceId = ref(store.selectedIds[0] ?? store.widgets[0]?.id ?? ""),
  origin = ref<"data" | "raw">("data"),
  path = ref("$"),
  slot = ref("value"),
  label = ref(""),
  tags = ref(""),
  unit = ref("");
const title = ref("Combined data"),
  type = ref<PresentationType>("auto"),
  error = ref(""),
  saved = ref("");
const bindings = ref<Record<string, DataBinding>>({}),
  fields = ref<TaggedField[]>(
    JSON.parse(JSON.stringify(store.fieldSelections)),
  );
const steps = ref("[]"),
  joinSource = ref(""),
  leftKey = ref(""),
  rightKey = ref(""),
  groupField = ref(""),
  measure = ref(""),
  method = ref<"count" | "sum" | "mean" | "min" | "max">("count");
const selected = computed(() =>
  store.widgets.find((w) => w.id === sourceId.value),
);
const result = computed(() =>
  selected.value ? store.resultForWidget(selected.value.id).result : undefined,
);
const preview = computed(() => {
  try {
    return readPath(
      origin.value === "raw" ? selected.value?.rawResponse : result.value?.data,
      path.value,
    );
  } catch {
    return undefined;
  }
});
function addField() {
  try {
    if (!selected.value) throw new Error("Choose a source card.");
    if (preview.value === undefined)
      throw new Error(
        "No value exists at this path. Inspect the source data and choose a field.",
      );
    const aliases: Record<string, string> = {
      number: "value",
      date: "time",
      image: "image_url",
      link: "url",
      text: "description",
      rows: "$data",
    };
    const key = aliases[slot.value] ?? slot.value;
    bindings.value = {
      ...bindings.value,
      [key]: {
        sourceId: sourceId.value,
        origin: origin.value,
        path: path.value,
        label: label.value || undefined,
      },
    };
    const field: TaggedField = {
      sourceId: sourceId.value,
      origin: origin.value,
      path: path.value,
      label: label.value || undefined,
      tags: tags.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      unit: unit.value || undefined,
    };
    fields.value = [
      ...fields.value.filter(
        (f) =>
          !(
            f.sourceId === field.sourceId &&
            f.path === field.path &&
            f.origin === field.origin
          ),
      ),
      field,
    ];
    store.selectFields(fields.value);
    error.value = "";
    saved.value = "Field selected and tagged.";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function useDataset() {
  slot.value = "$data";
  path.value = "$";
  origin.value = "data";
  addField();
}
function addStep(step: DataTransform) {
  try {
    const list = JSON.parse(steps.value);
    if (!Array.isArray(list))
      throw new Error("Transform steps must be an array.");
    steps.value = JSON.stringify([...list, step], null, 2);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function create() {
  try {
    const transforms = JSON.parse(steps.value) as DataTransform[];
    const sources = [
      ...new Set(
        [
          ...Object.values(bindings.value).map((b) => b.sourceId),
          ...transforms.map((t) => t.sourceId),
        ].filter((id): id is string => !!id),
      ),
    ];
    store.createDerived({
      sourceIds: sources,
      title: title.value,
      bindings: bindings.value,
      transforms,
      presentation: { type: type.value },
    });
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <ModalDialog title="Connect data to a new block" wide @close="emit('close')">
    <p>
      Select a whole dataset for rows or individual paths for a summary. The new
      block updates when its sources change.
    </p>
    <div class="form-grid">
      <label
        >Source card<select v-model="sourceId" aria-label="Composition source">
          <option v-for="w in store.widgets" :key="w.id" :value="w.id">
            {{ w.title }}
          </option>
        </select></label
      ><label
        >Read from<select v-model="origin">
          <option value="data">Normalized data</option>
          <option value="raw">Original response</option>
        </select></label
      ><label
        >JSON path<input
          v-model="path"
          aria-label="Selected field path"
          list="composition-fields" /></label
      ><label
        >Target field<input
          v-model="slot"
          aria-label="Target field"
          placeholder="title, number, rows, or a column name" /></label
      ><label>Display label<input v-model="label" maxlength="120" /></label
      ><label
        >Tags<input v-model="tags" placeholder="Comma-separated tags" /></label
      ><label
        >Unit<input
          v-model="unit"
          maxlength="40"
          placeholder="Optional, for example USD or km"
      /></label>
    </div>
    <datalist id="composition-fields">
      <option value="$" />
      <option
        v-for="f in result?.fields"
        :key="f.key"
        :value="Array.isArray(result?.data) ? `[0].${f.key}` : f.key"
      >
        {{ f.label }}
      </option>
    </datalist>
    <details>
      <summary>Inspect selected value</summary>
      <JsonBlock :value="preview" />
    </details>
    <div class="button-row">
      <button class="button" @click="addField">Select and tag field</button
      ><button class="button" @click="useDataset">Use source rows</button>
    </div>
    <p role="status" class="tiny">{{ saved }}</p>
    <ul class="binding-list">
      <li v-for="(binding, key) in bindings" :key="key">
        <code>{{ key }}</code
        ><span
          >{{ store.widgets.find((w) => w.id === binding.sourceId)?.title }} ·
          {{ binding.path }}</span
        ><button
          class="text-button"
          :aria-label="`Remove ${key} mapping`"
          @click="delete bindings[key]"
        >
          Remove
        </button>
      </li>
    </ul>
    <details v-if="fields.length" class="custom-settings">
      <summary>Selected fields and tags</summary>
      <div
        v-for="(field, index) in fields"
        :key="`${field.sourceId}:${field.origin}:${field.path}`"
        class="selected-field-row"
      >
        <p class="tiny">
          {{
            store.widgets.find((w) => w.id === field.sourceId)?.title ??
            "Removed source"
          }}
          · {{ field.origin }} · {{ field.path }}
        </p>
        <label
          >Field label<input
            v-model="field.label"
            maxlength="120"
            @change="store.selectFields(fields)"
        /></label>
        <label
          >Field tags<input
            :value="field.tags.join(', ')"
            @change="
              field.tags = ($event.target as HTMLInputElement).value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
              store.selectFields(fields);
            "
        /></label>
        <label
          >Field unit<input
            v-model="field.unit"
            maxlength="40"
            @change="store.selectFields(fields)"
        /></label>
        <button
          class="text-button"
          :aria-label="`Remove selected field ${field.path}`"
          @click="
            fields.splice(index, 1);
            store.selectFields(fields);
          "
        >
          Remove selection
        </button>
      </div>
    </details>
    <details class="custom-settings">
      <summary>Join or group rows</summary>
      <p class="tiny muted">
        First choose Use source rows. Joins keep each left row and attach a
        matching right row as joined. Right keys must be unique.
      </p>
      <div class="form-grid">
        <label
          >Join source<select v-model="joinSource" aria-label="Join source">
            <option value="">Choose another card</option>
            <option v-for="w in store.widgets" :key="w.id" :value="w.id">
              {{ w.title }}
            </option>
          </select></label
        ><label>Left key<input v-model="leftKey" /></label
        ><label>Right key<input v-model="rightKey" /></label>
      </div>
      <button
        class="button"
        :disabled="!joinSource || !leftKey || !rightKey"
        @click="
          addStep({
            op: 'join',
            sourceId: joinSource,
            field: leftKey,
            rightField: rightKey,
            as: 'joined',
          })
        "
      >
        Add join
      </button>
      <div class="form-grid">
        <label>Group field<input v-model="groupField" /></label
        ><label>Measure field<input v-model="measure" /></label
        ><label
          >Calculation<select v-model="method">
            <option
              v-for="m in ['count', 'sum', 'mean', 'min', 'max']"
              :key="m"
            >
              {{ m }}
            </option>
          </select></label
        >
      </div>
      <button
        class="button"
        :disabled="!groupField"
        @click="
          addStep({
            op: 'group',
            field: groupField,
            method,
            rightField: measure || undefined,
            as: 'value',
          })
        "
      >
        Add grouping
      </button>
    </details>
    <details class="custom-settings">
      <summary>Editable transform steps</summary>
      <p class="tiny muted">
        Use select, rename, filter, sort, limit, map, derive, aggregate, group,
        flatten, merge, or join. These are data rules, with no executable code.
      </p>
      <textarea
        v-model="steps"
        aria-label="Composition transforms JSON"
        rows="6"
        spellcheck="false"
      />
    </details>
    <div class="form-grid">
      <label
        >Block title<input
          v-model="title"
          aria-label="Derived block title"
          maxlength="120" /></label
      ><label
        >View<select v-model="type" aria-label="Derived block view">
          <option v-for="p in presentations" :key="p" :value="p">
            {{ p }}
          </option>
        </select></label
      >
    </div>
    <p v-if="error" role="alert" class="error-text">{{ error }}</p>
    <button class="button primary" @click="create">Create derived block</button>
  </ModalDialog>
</template>
