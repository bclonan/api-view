<script setup lang="ts">
import { computed, ref } from "vue";
import type { Row } from "../types";
import { scenarioFor } from "../runtime/scenarios";
import ScenarioBlock from "./ScenarioBlock.vue";
const props = defineProps<{
  rows: Row[];
  latitude: string;
  longitude: string;
}>();
const selected = ref(0);
const points = computed(() =>
  props.rows.filter(
    (r) =>
      r[props.latitude] != null &&
      String(r[props.latitude]).trim() !== "" &&
      r[props.longitude] != null &&
      String(r[props.longitude]).trim() !== "" &&
      Number.isFinite(Number(r[props.latitude])) &&
      Math.abs(Number(r[props.latitude])) <= 90 &&
      Number.isFinite(Number(r[props.longitude])) &&
      Math.abs(Number(r[props.longitude])) <= 180,
  ),
);
const current = computed(() => points.value[selected.value] ?? points.value[0]);
const name = (r: Row) => String(r.place ?? r.name ?? r.title ?? "Location");
const mapUrl = computed(() => {
  if (!current.value) return undefined;
  const lat = Number(current.value[props.latitude]),
    lon = Number(current.value[props.longitude]);
  const bbox = [
    Math.max(-180, lon - 0.03),
    Math.max(-90, lat - 0.02),
    Math.min(180, lon + 0.03),
    Math.min(90, lat + 0.02),
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`;
});
const address = computed(() =>
  current.value ? scenarioFor(current.value).values.address : undefined,
);
</script>
<template>
  <div class="map-block">
    <iframe
      v-if="mapUrl"
      :src="mapUrl"
      :title="`Map of ${name(current!)}`"
      loading="lazy"
      referrerpolicy="no-referrer"
      class="location-map"
    />
    <svg
      v-if="points.length > 1"
      viewBox="0 0 720 320"
      role="img"
      aria-label="Coordinate plot. Use the location list below for individual coordinates."
    >
      <defs>
        <pattern
          id="map-grid"
          width="60"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 60 0 L 0 0 0 40"
            fill="none"
            stroke="#dce4dc"
            stroke-width=".6"
          />
        </pattern>
      </defs>
      <rect width="720" height="320" fill="#f0f4ee" />
      <rect width="720" height="320" fill="url(#map-grid)" />
      <text x="10" y="18" fill="#768472" font-size="10">90° N</text>
      <text x="10" y="310" fill="#768472" font-size="10">90° S</text>
      <g v-for="(r, i) in points" :key="i">
        <circle
          :cx="(Number(r[longitude]) + 180) * 2"
          :cy="((90 - Number(r[latitude])) * 320) / 180"
          :r="i === selected ? 7 : 4.5"
          fill="#456c51"
          stroke="white"
          stroke-width="2"
        >
          <title>{{ name(r) }} · {{ r[latitude] }}, {{ r[longitude] }}</title>
        </circle>
      </g>
    </svg>
    <div class="map-detail" v-if="current">
      <strong>{{ name(current) }}</strong
      ><a
        :href="`https://www.openstreetmap.org/?mlat=${Number(current[latitude])}&mlon=${Number(current[longitude])}#map=6/${Number(current[latitude])}/${Number(current[longitude])}`"
        target="_blank"
        rel="noopener noreferrer"
        >Open map ↗</a
      ><span
        >{{ Number(current[latitude]).toFixed(3) }}°,
        {{ Number(current[longitude]).toFixed(3) }}°</span
      >
    </div>
    <p v-if="address">{{ address }}</p>
    <select
      v-if="points.length"
      aria-label="Select a location"
      v-model="selected"
    >
      <option v-for="(r, i) in points" :key="i" :value="i">
        {{ name(r) }}
      </option>
    </select>
    <p v-if="points.length" class="tiny muted">
      OpenStreetMap · {{ points.length }} mapped locations. The map needs an
      internet connection; coordinates and links remain available.
    </p>
    <p v-if="points.length < rows.length" role="status" class="notice">
      {{ rows.length - points.length }} records have missing or invalid
      coordinates. No location was guessed.
    </p>
    <ScenarioBlock v-if="!points.length" :rows="rows" kind="places" />
  </div>
</template>
<style scoped>
.location-map {
  width: 100%;
  height: 280px;
  border: 1px solid #dce3d7;
  border-radius: 10px;
}
</style>
