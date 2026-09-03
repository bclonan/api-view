<script setup lang="ts">
import { computed, defineAsyncComponent, provide } from "vue";
import { CloudSun, Droplets, Wind, ImageOff, BookOpen } from "lucide-vue-next";
import { rowsOf, isRow, numericTypes, numberOf } from "../runtime/normalize";
import { readPath } from "../runtime/fields";
import ValueRenderer from "../values/ValueRenderer.vue";
import TableBlock from "./TableBlock.vue";
const ChartBlock = defineAsyncComponent(() => import("./ChartBlock.vue"));
import MapBlock from "./MapBlock.vue";
import JsonBlock from "./JsonBlock.vue";
import StructuredBlock from "./StructuredBlock.vue";
import type { SemanticResult, PresentationSpec, Row } from "../types";
const props = defineProps<{
  result: SemanticResult;
  presentation: PresentationSpec;
  readonly?: boolean;
}>();
const emit = defineEmits<{ settings: [value: PresentationSpec["props"]] }>();
const type = computed(() =>
  props.presentation.type === "auto"
    ? props.result.suggestedPresentations[0]
    : props.presentation.type,
);
const rows = computed(() =>
  rowsOf(props.result.data).map((row) => ({
    ...row,
    ...Object.fromEntries(
      props.result.fields.map((field) => [field.key, readPath(row, field.key)]),
    ),
  })),
);
const currency = computed(() => {
  const codes = rows.value.map((row) => row.currency);
  const code =
    props.result.metadata.currency ??
    (codes.length && codes.every((value) => value === codes[0])
      ? codes[0]
      : "");
  return typeof code === "string" && /^[A-Z]{3}$/.test(code) ? code : "";
});
provide("api-canvas-currency", currency);
const fields = computed(() =>
  props.presentation.fields !== undefined
    ? props.presentation.fields.flatMap((key) =>
        props.result.fields.filter((f) => f.key === key),
      )
    : type.value === "document"
      ? props.result.fields
          .filter(
            (f) =>
              !/[.[]/.test(f.key) &&
              [
                "title",
                "person",
                "organization",
                "description",
                "doi",
                "isbn",
                "year",
                "date",
                "datetime",
                "timestamp",
                "url",
              ].some(
                (meaning) => meaning === f.semanticType || meaning === f.type,
              ),
          )
          .slice(0, 10)
      : props.result.fields,
);
const xField = computed(
  () =>
    props.presentation.xField ??
    props.result.fields.find((f) => ["date", "datetime"].includes(f.type))
      ?.key ??
    props.result.dimensions[0] ??
    props.result.fields[0]?.key ??
    "",
);
const yField = computed(
  () =>
    props.presentation.yField ??
    (props.result.measures.includes("value")
      ? "value"
      : props.result.measures[0]) ??
    "",
);
const yType = computed(
  () => props.result.fields.find((f) => f.key === yField.value)?.type,
);
const datedMetric = computed(() =>
  props.result.fields.some(
    (field) =>
      field.key === xField.value && ["date", "datetime"].includes(field.type),
  ),
);
const imageField = computed(
  () => fields.value.find((f) => f.type === "image")?.key,
);
const latitude = computed(
  () => props.result.fields.find((f) => f.type === "latitude")?.key,
);
const longitude = computed(
  () => props.result.fields.find((f) => f.type === "longitude")?.key,
);
const latest = computed(
  () =>
    [...rows.value]
      .sort((a, b) =>
        String(a[xField.value]).localeCompare(String(b[xField.value])),
      )
      .at(-1) ?? {},
);
const metric = computed(() => {
  const n = latest.value[yField.value];
  if (!Number.isFinite(numberOf(n))) return "Not available";
  return new Intl.NumberFormat("en-US", {
    notation:
      props.presentation.props?.numberFormat === "standard"
        ? "standard"
        : "compact",
    maximumFractionDigits: 2,
    ...(yType.value === "currency" && currency.value
      ? ({ style: "currency", currency: currency.value } as const)
      : {}),
  }).format(numberOf(n));
});
const metricChange = computed(() => {
  if (!datedMetric.value) return undefined;
  const ordered = [...rows.value].sort((a, b) =>
    String(a[xField.value]).localeCompare(String(b[xField.value])),
  );
  const first = numberOf(ordered[0]?.[yField.value]),
    last = numberOf(ordered.at(-1)?.[yField.value]);
  return ordered.length > 1 && first && Number.isFinite(last)
    ? ((last - first) / Math.abs(first)) * 100
    : undefined;
});
const current = computed(() =>
  isRow(props.result.metadata.current)
    ? props.result.metadata.current
    : undefined,
);
const conditions = computed(() => {
  const code = Number(current.value?.weather_code);
  return code === 0
    ? "Clear skies"
    : code <= 3
      ? "Partly cloudy"
      : code <= 48
        ? "Foggy"
        : code <= 67
          ? "Rain"
          : code <= 77
            ? "Snow"
            : code <= 82
              ? "Rain showers"
              : code <= 86
                ? "Snow showers"
                : "Thunderstorms";
});
const chartTypes = ["line-chart", "bar-chart", "area-chart", "scatter", "pie"];
const histogram = computed(() => {
  const values = rows.value
    .map((r) => numberOf(r[yField.value]))
    .filter(Number.isFinite);
  if (!values.length) return [];
  const min = Math.min(...values),
    max = Math.max(...values),
    n = min === max ? 1 : Math.min(16, Math.ceil(Math.sqrt(values.length))),
    width = (max - min) / n || 1;
  const bins = Array.from({ length: n }, (_, i) => ({
    range: `${(min + i * width).toFixed(2)} to ${(min + (i + 1) * width).toFixed(2)}`,
    count: 0,
  }));
  values.forEach(
    (v) => bins[Math.min(n - 1, Math.floor((v - min) / width))].count++,
  );
  return bins;
});
const canChart = computed(
  () =>
    !!yField.value &&
    rows.value.some(
      (r) =>
        r[yField.value] != null && Number.isFinite(numberOf(r[yField.value])),
    ) &&
    (type.value !== "scatter" ||
      rows.value.some((r) => Number.isFinite(numberOf(r[xField.value])))) &&
    (type.value !== "pie" ||
      (rows.value.length <= 12 &&
        rows.value.every((r) => numberOf(r[yField.value]) >= 0))),
);
const heading = (r: Row) =>
  String(
    props.presentation.fields?.length
      ? (r[
          fields.value.find((f) => !numericTypes.includes(f.type))?.key ?? ""
        ] ?? "Record")
      : (r.title ??
          r.name ??
          r.place ??
          r[props.result.dimensions[0]] ??
          "Record"),
  );
const url = (v: unknown) =>
  typeof v === "string" && /^https?:\/\//i.test(v) ? v : undefined;
const mediaField = computed(() =>
  props.result.fields.find((f) => ["audio", "video"].includes(f.type)),
);
const datedRows = computed(() =>
  [...rows.value].sort((a, b) =>
    String(b[xField.value]).localeCompare(String(a[xField.value])),
  ),
);
</script>
<template>
  <div v-if="!rows.length" class="empty-block">
    <ImageOff :size="26" />
    <h3>No results this time</h3>
    <p>Try a broader search or different inputs.</p>
  </div>
  <JsonBlock v-else-if="type === 'json'" :value="result.data" />
  <TableBlock
    :settings="presentation.props"
    :readonly="readonly"
    @settings="emit('settings', $event)"
    v-else-if="type === 'table'"
    :rows="rows"
    :fields="fields"
  />
  <StructuredBlock
    v-else-if="['comparison', 'calendar', 'graph'].includes(type)"
    :kind="type"
    :rows="rows"
    :fields="fields"
    :time-field="xField"
    :data="result.data"
  />
  <div v-else-if="type === 'histogram' && histogram.length">
    <ChartBlock
      :rows="histogram"
      x-field="range"
      y-field="count"
      type="bar-chart"
    /><TableBlock
      :settings="presentation.props"
      :readonly="readonly"
      @settings="emit('settings', $event)"
      :rows="histogram"
      :fields="[
        { key: 'range', label: 'Range', type: 'text', confidence: 1 },
        { key: 'count', label: 'Count', type: 'integer', confidence: 1 },
      ]"
    />
  </div>
  <div
    v-else-if="type === 'metric' || type === 'finance-quote'"
    class="metric-block"
  >
    <p class="eyebrow">
      {{
        latest.label ??
        latest.title ??
        result.fields.find((f) => f.key === yField)?.label ??
        "Value"
      }}
    </p>
    <div class="metric-value">
      {{ metric }}<small v-if="latest.unit"> {{ latest.unit }}</small>
    </div>
    <p v-if="latest.subtitle ?? latest.description" class="muted">
      {{ latest.subtitle ?? latest.description }}
    </p>
    <p v-if="metricChange !== undefined" class="metric-change">
      {{ metricChange >= 0 ? "+" : "" }}{{ metricChange.toFixed(2) }}%
      <span class="muted">over this period</span>
    </p>
    <p class="tiny muted" v-if="datedMetric && latest[xField]">
      As of <ValueRenderer :value="latest[xField]" :field-key="xField" />
    </p>
    <ChartBlock
      v-if="rows.length > 1 && yField"
      :rows="rows"
      :x-field="xField"
      :y-field="yField"
      type="area-chart"
    />
    <dl v-if="type === 'finance-quote'" class="key-values">
      <template
        v-for="field in fields.filter((f) =>
          /high|low|open|change/.test(f.key),
        )"
        :key="field.key"
        ><dt>{{ field.label }}</dt>
        <dd>
          <ValueRenderer
            :value="latest[field.key]"
            :semantic-type="field.type"
          /></dd
      ></template>
    </dl>
  </div>
  <div v-else-if="type === 'weather' && current" class="weather-block">
    <div class="weather-now">
      <div>
        <span class="weather-temp"
          >{{ current.temperature_2m }}<small>°C</small></span
        >
        <p>{{ conditions }}</p>
      </div>
      <CloudSun :size="58" stroke-width="1.1" />
    </div>
    <div class="weather-stats">
      <span
        ><Droplets :size="14" /> {{ current.relative_humidity_2m }}%
        humidity</span
      ><span><Wind :size="14" /> {{ current.wind_speed_10m }} km/h</span>
    </div>
    <ChartBlock
      :rows="rows"
      :x-field="xField"
      :y-field="yField"
      type="area-chart"
    />
    <p class="tiny muted">Hourly temperature · source local time</p>
  </div>
  <div v-else-if="chartTypes.includes(type) && canChart" class="chart-block">
    <div class="chart-caption">
      <span>{{ result.fields.find((f) => f.key === yField)?.label }}</span
      ><span
        >{{ rows.length }} records{{
          yType === "currency" && currency ? ` · ${currency}` : ""
        }}</span
      >
    </div>
    <ChartBlock
      :rows="rows"
      :x-field="xField"
      :y-field="yField"
      :series="presentation.series"
      :type="type"
    />
  </div>
  <MapBlock
    v-else-if="type === 'map' && latitude && longitude"
    :rows="rows"
    :latitude="latitude"
    :longitude="longitude"
  />
  <div
    v-else-if="['gallery', 'image'].includes(type) && imageField"
    :class="type === 'gallery' ? 'gallery-block' : 'image-block'"
  >
    <figure
      v-for="(row, i) in type === 'image' ? rows.slice(0, 1) : rows"
      :key="i"
    >
      <ValueRenderer
        :value="row[imageField]"
        semantic-type="image"
        :field-key="heading(row)"
      />
      <figcaption>
        <strong>{{ heading(row) }}</strong
        ><span v-if="row.author">{{ row.author }}</span>
      </figcaption>
    </figure>
  </div>
  <div v-else-if="type === 'stats'" class="stat-group">
    <div
      v-for="field in fields
        .filter((f) => numericTypes.includes(f.type))
        .slice(0, 8)"
      :key="field.key"
    >
      <span>{{ field.label }}</span
      ><strong
        ><ValueRenderer :value="latest[field.key]" :semantic-type="field.type"
      /></strong>
    </div>
    <p v-if="!fields.some((f) => numericTypes.includes(f.type))" class="muted">
      This response has no numeric fields. Try the record view.
    </p>
  </div>
  <div v-else-if="type === 'text'" class="text-block">
    <template v-if="!isRow(result.data) && !Array.isArray(result.data)"
      ><ValueRenderer :value="result.data" /></template
    ><template v-else
      ><p
        v-for="field in fields.filter((f) =>
          ['text', 'category'].includes(f.type),
        )"
        :key="field.key"
      >
        {{ rows[0][field.key] }}
      </p></template
    >
  </div>
  <div
    v-else-if="type === 'media' && mediaField && url(rows[0][mediaField.key])"
    class="media-block"
  >
    <video
      v-if="mediaField.type === 'video'"
      :src="url(rows[0][mediaField.key])"
      controls
      preload="metadata"
    /><audio
      v-else
      :src="url(rows[0][mediaField.key])"
      controls
      preload="metadata"
    />
    <p>{{ heading(rows[0]) }}</p>
  </div>
  <div v-else-if="type === 'timeline'" class="timeline-block">
    <article v-for="(row, i) in datedRows" :key="i">
      <span class="timeline-dot"></span
      ><time><ValueRenderer :value="row[xField]" :field-key="xField" /></time>
      <h3>{{ heading(row) }}</h3>
      <p v-if="yField">
        <ValueRenderer :value="row[yField]" :semantic-type="yType" />
        {{ result.fields.find((f) => f.key === yField)?.label }}
      </p>
    </article>
  </div>
  <div
    v-else-if="
      [
        'cards',
        'list',
        'record',
        'key-value',
        'book',
        'drug',
        'link-preview',
        'document',
      ].includes(type)
    "
    :class="['entity-block', `entity-${type}`]"
  >
    <article v-for="(row, i) in rows" :key="i">
      <div v-if="imageField" class="entity-image">
        <ValueRenderer
          :value="row[imageField]"
          semantic-type="image"
          :field-key="heading(row)"
        />
      </div>
      <div v-else-if="type === 'book'" class="book-cover">
        <BookOpen :size="28" /><span>{{ heading(row) }}</span>
      </div>
      <div class="entity-body">
        <h3 v-if="type !== 'key-value'">{{ heading(row) }}</h3>
        <p v-if="row.description" class="entity-description">
          {{ row.description }}
        </p>
        <dl class="key-values">
          <template
            v-for="field in fields.filter(
              (f) =>
                !['image', 'audio', 'video'].includes(f.type) &&
                (type === 'key-value' ||
                  !['title', 'description'].includes(f.key)),
            )"
            :key="field.key"
            ><dt>{{ field.label }}</dt>
            <dd>
              <details v-if="String(row[field.key] ?? '').length > 300">
                <summary>Read {{ field.label.toLowerCase() }}</summary>
                <p class="long-text">
                  <ValueRenderer
                    :value="row[field.key]"
                    :semantic-type="field.type"
                    :field-key="field.key"
                  />
                </p>
              </details>
              <ValueRenderer
                v-else
                :value="row[field.key]"
                :semantic-type="field.type"
                :field-key="field.key"
              /></dd
          ></template>
        </dl>
        <p v-if="type === 'drug'" class="tiny muted">
          Published label information. Open the source documentation for
          context.
        </p>
      </div>
    </article>
  </div>
  <div v-else class="unsupported-block">
    <p class="notice">
      This data does not fit the selected view. Choose another visualization or
      map compatible fields.
    </p>
    <TableBlock
      :settings="presentation.props"
      :readonly="readonly"
      @settings="emit('settings', $event)"
      :rows="rows"
      :fields="fields"
    />
  </div>
</template>
