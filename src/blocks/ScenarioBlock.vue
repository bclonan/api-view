<script setup lang="ts">
import { computed } from "vue";
import type { Row } from "../types";
import { scenarioFor } from "../runtime/scenarios";
import ValueRenderer from "../values/ValueRenderer.vue";
import JsonBlock from "./JsonBlock.vue";
const props = defineProps<{ rows: Row[]; kind: string }>();
const cards = computed(() =>
  props.rows
    .slice(0, 100)
    .map((row) => ({ raw: row, ...scenarioFor(row, props.kind) })),
);
const link = (v: unknown) => {
  try {
    const url = new URL(String(v));
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};
const coordinate = (v: unknown, max: number) =>
  v !== null &&
  v !== undefined &&
  String(v).trim() !== "" &&
  Number.isFinite(Number(v)) &&
  Math.abs(Number(v)) <= max;
const mapLink = (r: Row) =>
  coordinate(r.latitude, 90) && coordinate(r.longitude, 180)
    ? `https://www.openstreetmap.org/?mlat=${Number(r.latitude)}&mlon=${Number(r.longitude)}#map=15/${Number(r.latitude)}/${Number(r.longitude)}`
    : r.address
      ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(String(r.address))}`
      : undefined;
const details = computed(() =>
  props.kind === "sports-team"
    ? ["wins", "losses", "ties", "home_record", "away_record", "streak", "rank"]
    : props.kind === "product"
      ? ["price", "currency", "availability", "rating"]
      : props.kind === "person"
        ? ["role", "organization", "email"]
        : [],
);
const label = (key: string) => key.replaceAll("_", " ");
</script>
<template>
  <div :class="['scenario-block', `scenario-${kind}`]">
    <article v-for="(card, index) in cards" :key="index" class="scenario-card">
      <template v-if="card.kind === kind">
        <div class="scenario-heading">
          <ValueRenderer
            v-if="link(card.values.image_url)"
            :value="card.values.image_url"
            semantic-type="image"
            :field-key="String(card.values.title ?? 'Source image')"
          />
          <div>
            <p
              v-if="card.values.publisher || card.values.author"
              class="eyebrow"
            >
              {{ card.values.publisher ?? card.values.author }}
            </p>
            <h3 v-if="kind !== 'sports-score'">
              {{
                card.values.title ?? (kind === "places" ? "Location" : "Record")
              }}
            </h3>
            <p v-if="card.values.status_label" class="scenario-status">
              {{ card.values.status_label }}
            </p>
          </div>
        </div>
        <div v-if="kind === 'sports-score'" class="scoreboard">
          <div>
            <span class="eyebrow">Away</span
            ><strong>{{ card.values.away_team }}</strong
            ><b>{{ card.values.away_score ?? "—" }}</b>
          </div>
          <span class="score-versus">at</span>
          <div>
            <span class="eyebrow">Home</span
            ><strong>{{ card.values.home_team }}</strong
            ><b>{{ card.values.home_score ?? "—" }}</b>
          </div>
        </div>
        <p
          v-if="
            kind === 'sports-score' &&
            (card.values.home_score === undefined ||
              card.values.away_score === undefined)
          "
          class="tiny muted"
        >
          Score not supplied by the source.
        </p>
        <p
          v-if="kind === 'sports-team' && card.values.record_summary"
          class="team-record"
        >
          <strong>{{ card.values.record_summary }}</strong
          ><span>Overall record</span>
        </p>
        <dl v-if="details.length" class="scenario-stats">
          <template
            v-for="field in details.filter((f) => card.values[f] !== undefined)"
            :key="field"
            ><div>
              <dt>{{ label(field) }}</dt>
              <dd>
                <ValueRenderer
                  :value="card.values[field]"
                  :field-key="field"
                  :semantic-type="field === 'price' ? 'number' : undefined"
                />
              </dd></div
          ></template>
        </dl>
        <p v-if="card.values.time" class="scenario-time">
          <ValueRenderer :value="card.values.time" field-key="time" /><template
            v-if="card.values.end_time"
          >
            to <ValueRenderer :value="card.values.end_time" field-key="time"
          /></template>
        </p>
        <p v-if="card.values.venue">{{ card.values.venue }}</p>
        <p v-if="card.values.address" class="scenario-address">
          {{ card.values.address }}
        </p>
        <p
          v-if="
            kind === 'places' &&
            (!coordinate(card.values.latitude, 90) ||
              !coordinate(card.values.longitude, 180))
          "
          class="tiny muted"
        >
          No valid coordinates supplied. Search the address to locate it.
        </p>
        <p
          v-if="card.values.description && kind !== 'sports-team'"
          class="scenario-description"
        >
          {{ card.values.description }}
        </p>
        <a
          v-if="['places', 'events'].includes(kind) && mapLink(card.values)"
          :href="mapLink(card.values)"
          target="_blank"
          rel="noopener noreferrer"
          >{{
            coordinate(card.values.latitude, 90) &&
            coordinate(card.values.longitude, 180)
              ? "Open map"
              : "Find address"
          }}
          ↗</a
        >
        <a
          v-if="link(card.values.url)"
          :href="link(card.values.url)"
          target="_blank"
          rel="noopener noreferrer"
          >{{ kind === "news" ? "Read article" : "Open source" }} ↗</a
        >
      </template>
      <p v-else class="notice" role="status">
        Record {{ index + 1 }} does not have the fields required for this view.
        Inspect its details or edit the field mapping.
      </p>
      <details class="scenario-details">
        <summary>Record details</summary>
        <JsonBlock :value="card.raw" />
      </details>
    </article>
    <p v-if="rows.length > 100" class="notice">
      Showing 100 of {{ rows.length }} records. Use the table or add a filter to
      explore the rest.
    </p>
  </div>
</template>
<style scoped>
.scenario-block {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.scenario-card {
  border: 1px solid var(--border, #dce3d7);
  border-radius: 12px;
  padding: 18px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.scenario-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.scenario-heading :deep(img) {
  width: 52px;
  height: 52px;
  object-fit: contain;
  border-radius: 8px;
}
h3 {
  margin: 0;
  font-size: 17px;
  line-height: 1.45;
}
.scenario-status {
  display: inline-block;
  margin: 0 0 12px;
  padding: 4px 9px;
  border-radius: 20px;
  background: #eef3e9;
  color: #466044;
  font-size: 12px;
}
.scoreboard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  text-align: center;
}
.scoreboard > div {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.scoreboard strong {
  font-size: 16px;
  line-height: 1.4;
}
.scoreboard b {
  font-size: 36px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.score-versus {
  color: #6f7e68;
  font-size: 12px;
}
.team-record {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
}
.team-record strong {
  font-size: 34px;
  letter-spacing: -1px;
}
.team-record span {
  font-size: 12px;
  color: #62715d;
}
.scenario-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(85px, 1fr));
  gap: 16px;
  margin: 16px 0;
}
.scenario-stats dt {
  text-transform: capitalize;
  font-size: 12px;
  color: #62715d;
}
.scenario-stats dd {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 600;
}
.scenario-time {
  font-size: 13px;
  color: #62715d;
}
.scenario-description {
  white-space: pre-line;
  max-height: 12em;
  overflow: auto;
  line-height: 1.65;
}
.scenario-card > a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-right: 16px;
}
.scenario-details {
  margin-top: 12px;
  font-size: 12px;
  color: #62715d;
}
.scenario-details summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
}
</style>
