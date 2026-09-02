<script setup lang="ts">
import { ref } from "vue";
import {
  ArrowUp,
  Sparkles,
  LoaderCircle,
  TerminalSquare,
} from "lucide-vue-next";
import { createToolRunner } from "../webmcp/handlers";
import { useWorkspace } from "../stores/workspace";
import { templates } from "./templates";
import { searchApis } from "../api/registry";
import type { WidgetInput, PresentationType } from "../types";
const emit = defineEmits<{ tools: [] }>();
const store = useWorkspace();
const prompt = ref("");
const message = ref("");
const busy = ref(false);
const runTool = createToolRunner(store);
async function run(value = prompt.value) {
  if (busy.value || !value.trim()) return;
  prompt.value = value;
  busy.value = true;
  message.value = "";
  try {
    const q = value.toLowerCase();
    let result;
    if (/refresh/.test(q))
      result = await runTool("refresh_widgets", { scope: "all" });
    else if (
      /last 90|full width|line (graph|chart)/.test(q) &&
      store.widgets.some((w) => w.invocation.apiId === "treasury")
    ) {
      const widget =
        store.widgets.find(
          (w) =>
            w.invocation.apiId === "treasury" &&
            w.presentation.type !== "metric",
        ) ?? store.widgets.find((w) => w.invocation.apiId === "treasury")!;
      result = await runTool("update_widget", {
        widgetId: widget.id,
        patch: {
          ...(q.includes("90") ? { arguments: { limit: 90 } } : {}),
          presentation: { type: "line-chart" },
          ...(q.includes("full width") ? { width: 12 } : {}),
        },
      });
    } else if (/government|u\.s\.|federal debt.*earthquake/.test(q)) {
      await runTool("search_apis", { query: value });
      result = await runTool("create_dashboard", {
        title: templates[0].title,
        widgets: templates[0].widgets,
      });
    } else {
      const widgets: WidgetInput[] = [];
      const requestedPresentation: PresentationType | undefined =
        /bar (chart|graph)/.test(q)
          ? "bar-chart"
          : /table/.test(q)
            ? "table"
            : undefined;
      if (/debt|treasury/.test(q))
        widgets.push({
          apiId: "treasury",
          operationId: "debt-to-penny",
          arguments: { limit: /90/.test(q) ? 90 : 30 },
          presentation: requestedPresentation,
        });
      if (/weather|forecast/.test(q)) {
        const place = /baltimore/.test(q)
          ? { name: "Baltimore", latitude: 39.29, longitude: -76.61 }
          : /washington|\bdc\b/.test(q)
            ? { name: "Washington, DC", latitude: 38.9072, longitude: -77.0369 }
            : /new york/.test(q)
              ? { name: "New York", latitude: 40.7128, longitude: -74.006 }
              : undefined;
        widgets.push({
          apiId: "open-meteo",
          operationId: "forecast",
          title: place ? `${place.name} weather` : "Local weather",
          arguments: place
            ? { latitude: place.latitude, longitude: place.longitude }
            : {},
        });
      }
      if (/earthquake/.test(q))
        widgets.push({
          apiId: "usgs",
          operationId: "recent",
          arguments: {},
          presentation: requestedPresentation,
        });
      if (/book/.test(q))
        widgets.push({
          apiId: "open-library",
          operationId: "search",
          arguments: {
            q:
              value
                .replace(
                  /^(find|show|add|search)( me)? (some )?books? (about|on|for)?\s*/i,
                  "",
                )
                .trim() || "architecture",
            limit: 4,
          },
        });
      if (/nasa|space|mars|moon/.test(q))
        widgets.push({
          apiId: "nasa",
          operationId: "search",
          arguments: {
            q: /mars/.test(q) ? "mars" : /moon/.test(q) ? "moon" : "earth",
            limit: 6,
          },
        });
      else if (/photos|images/.test(q)) {
        if (/baltimore|washington|new york|\bof\b/.test(q))
          message.value =
            "The photo source cannot search by location. Choose NASA for space imagery or add an unfiltered photo collection from Discover.";
        else
          widgets.push({
            apiId: "picsum",
            operationId: "images",
            arguments: {},
          });
      }
      if (!widgets.length) {
        const matches = searchApis(value);
        message.value ||= matches.length
          ? `Try ${matches
              .slice(0, 3)
              .map((m) => m.apiName)
              .join(
                ", ",
              )} in Discover. The local command runner handles weather, debt, earthquakes, books, and NASA imagery. Connect a browser agent for broader planning.`
          : "No matching local command. Browse the sources or open Agent tools for the full operation schemas.";
        return;
      }
      await runTool("search_apis", { query: value });
      result = await runTool("create_dashboard", { widgets });
    }
    if (result?.isError)
      message.value = JSON.parse(result.content[0].text).error;
    else {
      message.value ||= `Workspace updated. ${store.widgets.filter((w) => w.status === "ready").length} ready, ${store.widgets.filter((w) => w.status === "needs-input").length} need inputs, ${store.widgets.filter((w) => w.status === "error").length} failed.`;
      prompt.value = "";
    }
  } catch (e) {
    message.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
defineExpose({ run });
</script>
<template>
  <div class="composer-wrap">
    <p v-if="message" class="composer-message" role="status">
      {{ message }}
      <button aria-label="Dismiss message" @click="message = ''">×</button>
    </p>
    <form class="composer" @submit.prevent="run()">
      <Sparkles :size="20" class="composer-spark" /><input
        aria-label="Workspace command"
        v-model="prompt"
        placeholder="Try: weather in Baltimore and federal debt"
        :disabled="busy"
      /><button
        class="composer-tools"
        type="button"
        aria-label="Open agent tools"
        @click="emit('tools')"
      >
        <TerminalSquare :size="18" /></button
      ><button
        class="send-button"
        type="submit"
        :disabled="busy || !prompt.trim()"
        aria-label="Run command"
      >
        <LoaderCircle v-if="busy" :size="19" class="spinning" /><ArrowUp
          v-else
          :size="20"
        />
      </button>
    </form>
    <div class="composer-caption">
      <span>Local command runner</span
      ><span>Connect a WebMCP agent for open-ended requests</span>
    </div>
  </div>
</template>
