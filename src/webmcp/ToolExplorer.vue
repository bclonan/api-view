<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ModalDialog from "../components/ModalDialog.vue";
import { contracts } from "./contracts";
import { createToolRunner, toolLog } from "./handlers";
import { webmcpStatus, webmcpError } from "./register";
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
};
watch(selected, () => {
  const widgetId = store.widgets[0]?.id ?? "read-get_workspace-first";
  input.value = JSON.stringify(
    examples[selected.value] ?? {
      widgetId,
      ...(selected.value === "transform_widget"
        ? { presentation: "table" }
        : selected.value === "update_widget"
          ? { patch: { title: "Updated widget" } }
          : {}),
    },
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
          ? "12 tools registered with WebMCP"
          : "Native WebMCP is unavailable in this browser"
      }}</strong>
      <p>
        {{
          webmcpStatus === "available"
            ? "A connected browser agent can discover and call these tools."
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
