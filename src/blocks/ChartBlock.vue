<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Row } from "../types";
import { numberOf } from "../runtime/normalize";
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
]);
const props = defineProps<{
  rows: Row[];
  xField: string;
  yField: string;
  type: string;
  series?: string[];
}>();
const root = ref<HTMLElement>();
let chart: echarts.ECharts | undefined;
let observer: ResizeObserver | undefined;
const ordered = computed(() =>
  [...props.rows]
    .filter(
      (r) =>
        r[props.yField] !== null &&
        r[props.yField] !== undefined &&
        Number.isFinite(numberOf(r[props.yField])),
    )
    .sort((a, b) =>
      /^\d{4}-/.test(String(a[props.xField]))
        ? String(a[props.xField]).localeCompare(String(b[props.xField]))
        : 0,
    ),
);
const compact = (n: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
function draw() {
  if (!chart) return;
  const rows = ordered.value;
  const isPie = props.type === "pie",
    isScatter = props.type === "scatter";
  chart.setOption(
    {
      animation: false,
      color: ["#3c725b", "#9cb390", "#d1b880", "#71919b", "#b88d7b", "#c3cbb5"],
      tooltip: {
        trigger: isPie || isScatter ? "item" : "axis",
        renderMode: "richText",
        confine: true,
      },
      grid: { left: 62, right: 18, top: 20, bottom: 44 },
      xAxis: isPie
        ? undefined
        : {
            type: isScatter ? "value" : "category",
            data: isScatter
              ? undefined
              : rows.map((r) => String(r[props.xField])),
            axisLine: { lineStyle: { color: "#e2e5dd" } },
            axisTick: { show: false },
            axisLabel: {
              color: "#7e847b",
              fontSize: 10,
              hideOverlap: true,
              formatter: (v: string) =>
                /^\d{4}-/.test(v)
                  ? v.includes("T")
                    ? v.slice(11, 16)
                    : v.slice(5, 10)
                  : v.length > 15
                    ? `${v.slice(0, 14)}…`
                    : v,
            },
          },
      yAxis: isPie
        ? undefined
        : {
            type: "value",
            scale: true,
            splitLine: { lineStyle: { color: "#eff0eb" } },
            axisLabel: { color: "#7e847b", fontSize: 10, formatter: compact },
          },
      series: (isPie || isScatter
        ? [props.yField]
        : props.series?.length
          ? props.series
          : [props.yField]
      )
        .slice(0, 4)
        .map((field) => ({
          name: field,
          type: isPie
            ? "pie"
            : isScatter
              ? "scatter"
              : props.type === "bar-chart"
                ? "bar"
                : "line",
          radius: isPie ? ["45%", "70%"] : undefined,
          label: isPie
            ? { formatter: "{b}", overflow: "truncate", width: 80 }
            : undefined,
          smooth: false,
          showSymbol: rows.length < 8,
          symbolSize: isScatter ? 10 : 5,
          lineStyle: { width: 2.5 },
          itemStyle: {
            borderRadius: props.type === "bar-chart" ? [4, 4, 0, 0] : 0,
          },
          areaStyle:
            props.type === "area-chart" ? { opacity: 0.12 } : undefined,
          data: isPie
            ? rows.map((r) => ({
                name: String(r[props.xField]),
                value: numberOf(r[props.yField]),
              }))
            : isScatter
              ? rows.map((r) => [
                  numberOf(r[props.xField]),
                  numberOf(r[props.yField]),
                ])
              : rows.map((r) => numberOf(r[field])),
        })),
    },
    true,
  );
}
watch(
  () => [props.rows, props.type, props.xField, props.yField, props.series],
  draw,
  {
    deep: true,
  },
);
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
  <div
    ref="root"
    class="chart"
    role="img"
    :aria-label="`${type}: ${yField} by ${xField}, ${ordered.length} points. Use the Data tab for an accessible table.`"
  ></div>
</template>
