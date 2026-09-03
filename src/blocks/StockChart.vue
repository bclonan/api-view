<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import * as echarts from "echarts/core";
import { CandlestickChart, LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Row, PresentationSpec } from "../types";
import { pricePoint } from "../runtime/market";
echarts.use([
  CandlestickChart,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  CanvasRenderer,
]);
const props = defineProps<{
  rows: Row[];
  settings?: PresentationSpec["props"];
}>();
const emit = defineEmits<{ settings: [value: PresentationSpec["props"]] }>();
const points = computed(() => props.rows.map(pricePoint));
const symbols = computed(() => [...new Set(points.value.map((p) => p.symbol))]);
const selected = ref(props.settings?.stockSymbol ?? "");
watch(
  symbols,
  (values) => {
    if (!values.includes(selected.value)) selected.value = values[0] ?? "";
  },
  { immediate: true },
);
const mode = ref(props.settings?.stockStyle ?? "candles");
function saveSettings() {
  emit("settings", {
    ...props.settings,
    stockSymbol: selected.value.slice(0, 120),
    stockStyle: mode.value,
  });
}
const symbol = computed(() =>
  symbols.value.includes(selected.value) ? selected.value : symbols.value[0],
);
const data = computed(() =>
  points.value
    .filter((p) => p.symbol === symbol.value && p.time && p.close !== undefined)
    .sort((a, b) => a.time!.localeCompare(b.time!))
    .slice(-1000),
);
const invalid = computed(
  () =>
    points.value.filter(
      (p) => p.symbol === symbol.value && (!p.time || p.close === undefined),
    ).length,
);
const candles = computed(
  () => mode.value === "candles" && data.value.some((p) => p.ohlc),
);
const volume = computed(() => data.value.some((p) => p.volume !== undefined));
const root = ref<HTMLElement>();
let chart: echarts.ECharts | undefined, observer: ResizeObserver | undefined;
function draw() {
  if (!chart) return;
  const rows = data.value;
  const dates = rows.map((p) =>
    p
      .time!.replace("T00:00:00.000Z", "")
      .replace("T", " ")
      .replace(".000Z", " UTC"),
  );
  chart.setOption(
    {
      animation: false,
      tooltip: { trigger: "axis", renderMode: "richText", confine: true },
      grid: [
        { left: 55, right: 16, top: 15, bottom: volume.value ? 125 : 65 },
        { left: 55, right: 16, height: 45, bottom: 65 },
      ],
      xAxis: [
        { type: "category", data: dates, axisLabel: { hideOverlap: true } },
        { type: "category", data: dates, gridIndex: 1, show: false },
      ],
      yAxis: [
        { scale: true, type: "value" },
        { scale: true, type: "value", gridIndex: 1, show: false },
      ],
      dataZoom: [
        { type: "slider", xAxisIndex: [0, 1], bottom: 5, height: 22 },
        { type: "inside", xAxisIndex: [0, 1] },
      ],
      series: [
        {
          name: candles.value ? "Open / close / low / high" : "Close",
          type: candles.value ? "candlestick" : "line",
          connectNulls: false,
          data: rows.map((p) =>
            candles.value
              ? p.ohlc
                ? [p.open, p.close, p.low, p.high]
                : [null, null, null, null]
              : p.close,
          ),
          itemStyle: candles.value
            ? {
                color: "#47795d",
                color0: "#b36a55",
                borderColor: "#47795d",
                borderColor0: "#b36a55",
              }
            : { color: "#47795d" },
        },
        ...(volume.value
          ? [
              {
                name: "Volume",
                type: "bar",
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: rows.map((p) => p.volume ?? null),
                itemStyle: { color: "#a1b59b" },
              },
            ]
          : []),
      ],
    },
    true,
  );
}
watch([data, mode], draw, { deep: true });
onMounted(() => {
  if (root.value) {
    chart = echarts.init(root.value);
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(root.value);
    draw();
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>
<template>
  <section class="stock-block">
    <div class="button-row">
      <label
        >Series
        <select
          aria-label="Stock symbol"
          v-model="selected"
          @change="saveSettings"
        >
          <option v-for="s in symbols" :key="s" :value="s">{{ s }}</option>
        </select></label
      ><label
        >Chart
        <select
          aria-label="Price chart style"
          v-model="mode"
          @change="saveSettings"
        >
          <option value="candles">Candlesticks when available</option>
          <option value="line">Closing price</option>
        </select></label
      >
    </div>
    <p>
      {{ symbol
      }}<template v-if="data.at(-1)">
        · Latest supplied close {{ data.at(-1)!.close }}
        {{ data.at(-1)!.currency }}</template
      >
    </p>
    <p v-if="!data.length" role="status">
      No valid dated prices. Map time and close, or open, high, low and close.
    </p>
    <p v-if="invalid" class="notice">
      {{ invalid }} undated or missing prices are omitted. No price was filled
      in.
    </p>
    <p v-if="mode === 'candles' && data.some((p) => !p.ohlc)" class="notice">
      Some rows lack valid OHLC values.
      {{
        candles
          ? "Those candles remain gaps."
          : "Showing available closing prices."
      }}
    </p>
    <div
      ref="root"
      class="stock-chart"
      role="img"
      :aria-label="`${symbol}: ${data.length} supplied price observations. ${candles ? 'Candlesticks' : 'Closing prices'}.`"
    />
    <details>
      <summary>Price data table</summary>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Open</th>
              <th>High</th>
              <th>Low</th>
              <th>Close</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in data" :key="i">
              <td>{{ p.time }}</td>
              <td>{{ p.open ?? "Unavailable" }}</td>
              <td>{{ p.high ?? "Unavailable" }}</td>
              <td>{{ p.low ?? "Unavailable" }}</td>
              <td>{{ p.close }}</td>
              <td>{{ p.volume ?? "Unavailable" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
    <p class="tiny muted">
      Up to 1,000 supplied observations. Currency and freshness come from the
      source. No live market feed is implied.
    </p>
  </section>
</template>
<style scoped>
.stock-block {
  min-width: 0;
  display: grid;
  gap: 10px;
}
.stock-chart {
  width: 100%;
  height: 340px;
  min-width: 0;
}
label {
  font-size: 12px;
  display: grid;
  gap: 5px;
  min-width: 0;
}
.table-scroll {
  overflow: auto;
}
td,
th {
  padding: 8px;
  text-align: left;
  white-space: nowrap;
}
</style>
