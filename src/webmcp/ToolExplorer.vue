<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ModalDialog from "../components/ModalDialog.vue";
import { contracts } from "./contracts";
import { createToolRunner, toolLog } from "./handlers";
import { webmcpStatus, webmcpError, nativeContracts } from "./register";
import { useWorkspace } from "../stores/workspace";
const emit = defineEmits<{ close: [] }>();
const store = useWorkspace();
const selected = ref("search_apis");
const input = ref('{\n  "query": "federal debt"\n}');
const output = ref("");
const busy = ref(false);
const current = computed(() =>
  contracts.find((c) => c.name === selected.value)!,
);
const runTool = createToolRunner(store);
const examples: Record<string, unknown> = {
  discover_data_sources: { query: "weather", publicCatalog: true },
  inspect_source: { url: "https://api.nobelprize.org/2.1/nobelPrizes?limit=3" },
  test_data_source: {
    url: "https://api.nobelprize.org/2.1/nobelPrizes?limit=3",
  },
  list_workspace_sources: {},
  list_blocks: {},
  get_page_context: { limit: 10 },
  use_all_page_data: { limit: 10 },
  collapse_sidebar: { collapsed: true },
  open_share_view: {},
  plan_goal: {
    prompt:
      "Build an earthquake research dashboard with weather near the strongest event.",
  },
  execute_goal: {
    prompt:
      "Build an earthquake research dashboard with weather near the strongest event.",
  },
  search_api_catalog: { query: "earthquakes from the last week" },
  inspect_api_capability: {
    sourceId: "usgs",
    capabilityId: "earthquake.search",
  },
  run_api: {
    sourceId: "usgs",
    capabilityId: "earthquake.search",
    params: { minmagnitude: 5, limit: 12 },
    mode: "sample",
  },
  test_source: {
    sourceId: "crossref",
    capabilityId: "research.search",
    params: { query: "earthquakes", rows: 1 },
  },
  search_apis: { query: "federal debt" },
  describe_api: { apiId: "treasury", operationId: "debt-to-penny" },
  invoke_api: {
    apiId: "treasury",
    operationId: "debt-to-penny",
    arguments: { limit: 5 },
    mode: "sample",
  },
  create_widget: {
    apiId: "open-meteo",
    operationId: "forecast",
    arguments: {},
    mode: "sample",
  },
  create_dashboard: {
    title: "My dashboard",
    widgets: [
      {
        apiId: "treasury",
        operationId: "debt-to-penny",
        arguments: {},
        mode: "sample",
      },
    ],
  },
  refresh_widgets: { scope: "all" },
  get_workspace: {},
  export_workspace: {},
  manage_dashboard: { action: "create", title: "New dashboard" },
  list_components: {},
  define_api: {
    definition: {
      id: "custom-example",
      name: "Example JSON",
      baseUrl: "https://example.com",
      endpoint: "/data",
      method: "GET",
      sampleResponse: {
        records: [{ name: "Example place", population: 62000 }],
      },
      responsePath: "records",
    },
  },
};
watch(selected, () => {
  const widgetId = store.widgets[0]?.id ?? "read-get_workspace-first";
  input.value = JSON.stringify(
    examples[selected.value] ??
      (["inspect_data", "suggest_views", "add_card"].includes(selected.value)
        ? {
            envelopeId:
              store.widgets[0]?.result?.id ??
              store.dataRequests[0]?.response.result.id ??
              "run_api first",
          }
        : [
              "duplicate_card",
              "update_card",
              "transform_data",
              "combine_data",
            ].includes(selected.value)
          ? {
              cardId: widgetId,
              ...(selected.value === "transform_data"
                ? { steps: [{ op: "limit", count: 5 }] }
                : {}),
            }
          : selected.value === "select_cards"
            ? { cardIds: [widgetId] }
            : {
                widgetId,
                ...(selected.value === "transform_widget"
                  ? { presentation: "table" }
                  : selected.value === "update_widget"
                    ? { patch: { title: "Updated widget" } }
                    : {}),
              }),
    null,
    2,
  );
  output.value = "";
});
async function run() {
  busy.value = true;
  try {
    const result = await runTool(selected.value, JSON.parse(input.value));
    output.value = JSON.stringify(JSON.parse(result.content[0].text), null, 2);
  } catch (e) {
    output.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <ModalDialog title="Agent tools" wide @close="emit('close')"
    ><div class="tool-status">
      <span
        :class="['status-dot', { ready: webmcpStatus === 'available' }]"
      ></span
      ><strong>{{
        webmcpStatus === "available"
          ? `${nativeContracts.length} tools registered with WebMCP`
          : "Native WebMCP is unavailable in this browser"
      }}</strong>
      <p>
        {{
          webmcpStatus === "available"
            ? `A connected browser agent can call the registered tools. All ${contracts.length} tools, including compatibility aliases, are available in this local runner.`
            : "Manual controls and the local tool runner work without native WebMCP."
        }}
      </p>
      <p v-if="webmcpError">{{ webmcpError }}</p>
    </div>
    <div class="tool-layout">
      <nav aria-label="Available tools">
        <button
          v-for="tool in contracts"
          :key="tool.name"
          :class="{ active: selected === tool.name }"
          @click="selected = tool.name"
        >
          <code>{{ tool.name }}</code
          ><span>{{ tool.readOnly ? "Read" : "Edit" }}</span>
        </button>
      </nav>
      <div class="tool-editor">
        <h3>{{ selected }}</h3>
        <p>{{ current.description }}</p>
        <details>
          <summary>Input schema</summary>
          <pre>{{ JSON.stringify(current.schema, null, 2) }}</pre>
        </details>
        <label
          >Arguments<textarea
            v-model="input"
            aria-label="Tool arguments"
            spellcheck="false"
            rows="8"
          ></textarea></label
        ><button class="button primary" :disabled="busy" @click="run">
          {{ busy ? "Running..." : "Run locally" }}
        </button>
        <p class="tiny muted">
          This calls the same workspace actions as the registered tool. Edit
          tools change this workspace.
        </p>
        <pre v-if="output" class="tool-output" aria-label="Tool result">{{
          output
        }}</pre>
      </div>
    </div>
    <details class="tool-activity">
      <summary>Recent activity · {{ toolLog.length }} calls</summary>
      <div v-for="entry in toolLog" :key="entry.id">
        <code>{{ entry.tool }}</code
        ><span>{{ entry.ok ? "Completed" : entry.message }}</span
        ><span>{{ entry.duration }} ms</span>
      </div>
    </details></ModalDialog
  >
</template>
