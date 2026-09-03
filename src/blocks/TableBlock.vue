<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ValueRenderer from "../values/ValueRenderer.vue";
import { readPath } from "../runtime/fields";
import type { Row, SemanticField, PresentationSpec } from "../types";
import { download } from "../runtime/download";
function exportCsv() {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  download(
    "canvas-table.csv",
    [
      props.fields.map((f) => cell(f.label)).join(","),
      ...filtered.value.map((row) =>
        props.fields.map((f) => cell(readPath(row, f.key))).join(","),
      ),
    ].join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
const props = defineProps<{
  rows: Row[];
  fields: SemanticField[];
  settings?: PresentationSpec["props"];
  readonly?: boolean;
}>();
const emit = defineEmits<{ settings: [value: PresentationSpec["props"]] }>();
const sort = ref(props.settings?.sort ?? "");
const direction = ref(props.settings?.sortDirection === "desc" ? -1 : 1);
const page = ref(0);
const filter = ref(props.settings?.filter ?? "");
watch([filter, sort, direction], () => {
  if (!props.readonly)
    emit("settings", {
      filter: filter.value,
      sort: sort.value,
      sortDirection: direction.value === 1 ? "asc" : "desc",
    });
});
watch(
  () => props.settings,
  (value) => {
    filter.value = value?.filter ?? "";
    sort.value = value?.sort ?? "";
    direction.value = value?.sortDirection === "desc" ? -1 : 1;
  },
  { deep: true },
);
const filtered = computed(() =>
  props.rows
    .filter(
      (r) =>
        !filter.value ||
        JSON.stringify(r).toLowerCase().includes(filter.value.toLowerCase()),
    )
    .sort((a, b) => {
      if (!sort.value) return 0;
      const x = readPath(a, sort.value),
        y = readPath(b, sort.value);
      return (
        direction.value *
        (x !== null &&
        y !== null &&
        Number.isFinite(Number(x)) &&
        Number.isFinite(Number(y))
          ? Number(x) - Number(y)
          : String(x ?? "").localeCompare(String(y ?? "")))
      );
    }),
);
const pages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / 10)),
);
watch([filter, () => props.rows], () => {
  page.value = 0;
});
function changeSort(key: string) {
  direction.value = sort.value === key ? -direction.value : 1;
  sort.value = key;
}
</script>
<template>
  <div class="data-table">
    <button v-if="!readonly" class="text-button" @click="exportCsv">
      Export CSV
    </button>
    <label v-if="!readonly" class="table-search"
      ><span>Filter rows</span
      ><input
        v-model="filter"
        maxlength="500"
        placeholder="Find in this data..."
    /></label>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th
              v-for="field in fields"
              :key="field.key"
              :aria-sort="
                sort === field.key
                  ? direction === 1
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <span v-if="readonly">{{ field.label }}</span>
              <button v-else @click="changeSort(field.key)">
                {{ field.label }}
                <span>{{
                  sort === field.key ? (direction === 1 ? "↑" : "↓") : "↕"
                }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in filtered.slice(page * 10, page * 10 + 10)"
            :key="i"
          >
            <td v-for="field in fields" :key="field.key">
              <ValueRenderer
                :value="readPath(row, field.key)"
                :semantic-type="field.type"
                :field-key="field.key"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>{{ filtered.length }} records</span>
      <div>
        <button
          aria-label="Previous page"
          :disabled="page === 0"
          @click="page--"
        >
          ←</button
        ><span>{{ page + 1 }} / {{ pages }}</span
        ><button
          aria-label="Next page"
          :disabled="page + 1 >= pages"
          @click="page++"
        >
          →
        </button>
      </div>
    </div>
  </div>
</template>
