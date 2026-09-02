<script setup lang="ts">
import { computed } from "vue";
import type { Row, SemanticField } from "../types";
import ValueRenderer from "../values/ValueRenderer.vue";
const props = defineProps<{
  kind: string;
  rows: Row[];
  fields: SemanticField[];
  timeField: string;
  data: unknown;
}>();
const title = (row: Row) =>
  String(
    row.title ??
      row.name ??
      row[props.fields.find((f) => f.semanticType === "title")?.key ?? ""] ??
      "Record",
  );
const days = computed(() => {
  const grouped: Record<string, Row[]> = {};
  for (const row of props.rows) {
    const day = String(row[props.timeField] ?? "Undated").slice(0, 10);
    (grouped[day] ??= []).push(row);
  }
  return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
});
const graph = computed(() => {
  const value = props.data as any;
  const nodes = Array.isArray(value?.nodes) ? value.nodes.slice(0, 60) : [];
  const edges = Array.isArray(value?.edges) ? value.edges.slice(0, 150) : [];
  return {
    nodes: nodes.map((n: any, i: number) => ({
      ...n,
      x: 250 + 185 * Math.cos((i / nodes.length) * Math.PI * 2),
      y: 180 + 135 * Math.sin((i / nodes.length) * Math.PI * 2),
    })),
    edges,
  };
});
const node = (id: unknown) => graph.value.nodes.find((n: any) => n.id === id);
</script>
<template>
  <div v-if="kind === 'comparison'" class="table-scroll">
    <table class="comparison-table">
      <caption>
        Record comparison
      </caption>
      <thead>
        <tr>
          <th>Property</th>
          <th v-for="(row, i) in rows.slice(0, 12)" :key="i">
            {{ title(row) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="field in fields" :key="field.key">
          <th>{{ field.label }}</th>
          <td v-for="(row, i) in rows.slice(0, 12)" :key="i">
            <ValueRenderer
              :value="row[field.key]"
              :semantic-type="field.type"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="rows.length > 12" class="notice">
      Showing the first 12 records. Filter the data to compare fewer records.
    </p>
  </div>
  <div v-else-if="kind === 'calendar'" class="calendar-grid">
    <section v-for="[day, items] in days" :key="day">
      <h3>{{ day }}</h3>
      <p v-for="(row, i) in items" :key="i">{{ title(row) }}</p>
    </section>
  </div>
  <div v-else class="relationship-block">
    <svg
      viewBox="0 0 500 360"
      role="img"
      aria-label="Relationship graph. Connections are also listed below."
    >
      <template v-for="(edge, i) in graph.edges" :key="i">
        <line
          v-if="node(edge.source) && node(edge.target)"
          :x1="node(edge.source).x"
          :y1="node(edge.source).y"
          :x2="node(edge.target).x"
          :y2="node(edge.target).y"
          stroke="#95ad98"
        />
      </template>
      <g v-for="item in graph.nodes" :key="item.id">
        <circle :cx="item.x" :cy="item.y" r="8" fill="#456c51" />
        <text :x="item.x" :y="item.y - 13" text-anchor="middle" font-size="11">
          {{ String(item.label ?? item.id).slice(0, 25) }}
        </text>
      </g>
    </svg>
    <ul>
      <li v-for="(edge, i) in graph.edges" :key="i">
        {{ node(edge.source)?.label ?? edge.source }} →
        {{ node(edge.target)?.label ?? edge.target }} {{ edge.label ?? "" }}
      </li>
    </ul>
  </div>
</template>
