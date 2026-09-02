<script setup lang="ts">
import { computed, ref } from "vue";
import type { Row } from "../types";
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
      r[props.longitude] != null &&
      Number.isFinite(Number(r[props.latitude])) &&
      Math.abs(Number(r[props.latitude])) <= 90 &&
      Number.isFinite(Number(r[props.longitude])) &&
      Math.abs(Number(r[props.longitude])) <= 180,
  ),
);
const current = computed(() => points.value[selected.value] ?? points.value[0]);
const name = (r: Row) => String(r.place ?? r.name ?? r.title ?? "Location");
</script>
<template>
  <div class="map-block">
    <svg
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
      <path
        d="M70 65l40-25 45 8 25 25 45 8-22 38-32 10-9 31-28-8-20-42-28-16z M176 159l39 10 18 40-17 68-22-24-11-44z M314 70l47-32 82 6 33 23 60-12 76 49-35 27-54-7-30 25-33-30-34 8-23-24-46 5-12-20z M335 130l50-6 30 37-15 55-32 15-29-53z M553 221l41-13 37 26-11 23-60-6z"
        fill="#dbe5d7"
        stroke="#c8d5c4"
      />
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
    <select aria-label="Select a location" v-model="selected">
      <option v-for="(r, i) in points" :key="i" :value="i">
        {{ name(r) }}
      </option>
    </select>
    <p class="tiny muted">
      Schematic world map · {{ points.length }} locations
    </p>
  </div>
</template>
