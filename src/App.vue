<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  PanelsTopLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Download,
  Upload,
  RefreshCw,
  ArrowUpRight,
  LayoutGrid,
  Check,
  Code,
  ArrowRight,
  Globe,
  BookOpen,
  Orbit,
} from "lucide-vue-next";
import { useWorkspace } from "./stores/workspace";
import DiscoverDrawer from "./discover/DiscoverDrawer.vue";
import OperationPicker from "./discover/OperationPicker.vue";
import WorkspaceGrid from "./workspace/WorkspaceGrid.vue";
import AgentComposer from "./workspace/AgentComposer.vue";
import DashboardManager from "./workspace/DashboardManager.vue";
import RequestHistory from "./workspace/RequestHistory.vue";
const historyOpen = ref(false);
import CustomApiEditor from "./discover/CustomApiEditor.vue";
import { apis, customApis } from "./api/registry";
const customEditor = ref(false);
const customEditId = ref<string>();
import ToolExplorer from "./webmcp/ToolExplorer.vue";
import ModalDialog from "./components/ModalDialog.vue";
import { templates, createTemplate } from "./workspace/templates";
import { registerTools, webmcpStatus } from "./webmcp/register";
import { createToolRunner } from "./webmcp/handlers";
import { blockOutcome } from "./runtime/outcomes";
import { download } from "./runtime/download";
import { useEditor } from "./stores/editor";
import { pageContext } from "./workspace/context";
import { shareLink } from "./workspace/share";
import ShareView from "./workspace/ShareView.vue";
import SourceDiscovery from "./discover/SourceDiscovery.vue";
import ComposeBlock from "./workspace/ComposeBlock.vue";
import JsonBlock from "./blocks/JsonBlock.vue";
import ContentEditor from "./workspace/ContentEditor.vue";
import AskCanvas from "./workspace/AskCanvas.vue";
import { summarizeCanvas } from "./workspace/insights";
import type { CustomApiConfig } from "./types";
const store = useWorkspace();
const editor = useEditor();
function addSummary() {
  try {
    store.createContent(summarizeCanvas(store), "computed");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
const collapsed = computed({
  get: () => editor.collapsed,
  set: (value) => {
    editor.collapsed = value;
  },
});
const sourceDiscovery = ref(false),
  composeOpen = ref(false),
  discoveredDefinition = ref<CustomApiConfig>();
const sharedEncoded = location.hash.startsWith("#share=")
  ? location.hash.slice(7)
  : "";
const shared = ref<ReturnType<typeof shareLink>>();
watch(
  () => editor.shareOpen,
  (value) => {
    if (value) {
      try {
        shared.value = shareLink(store);
        error.value = "";
      } catch (e) {
        editor.shareOpen = false;
        error.value = (e as Error).message;
      }
    }
  },
);
const context = computed(() =>
  editor.contextOpen ? pageContext(store) : undefined,
);
async function confirmDashboard() {
  try {
    const pending = editor.pendingDashboard;
    if (!pending) return;
    store.checkRevision(pending.revision);
    if (pending.action === "clear") store.clearDashboard();
    else await store.deleteDashboard(pending.dashboardId);
    editor.pendingDashboard = undefined;
  } catch (e) {
    error.value = (e as Error).message;
    editor.pendingDashboard = undefined;
  }
}
function confirmRemove() {
  try {
    const pending = editor.pendingDelete;
    if (!pending) return;
    store.checkRevision(pending.revision);
    store.removeWidget(pending.widgetId);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    editor.pendingDelete = undefined;
  }
}
async function copyShare() {
  if (shared.value)
    try {
      await navigator.clipboard.writeText(shared.value.url);
      store.notice = "Share link copied.";
    } catch {
      store.notice = "Copy the share URL from the field below.";
    }
}
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const picker = ref<{ apiId: string; operationId: string }>();
const toolsOpen = ref(false);
const templatesOpen = ref(false);
const importInput = ref<HTMLInputElement>();
const importValue = ref<unknown>();
const busy = ref(false);
const error = ref("");
const allReady = computed(
  () =>
    store.widgets.length > 0 &&
    store.widgets.every(
      (w) => blockOutcome(w, store.resultForWidget(w.id)).status === "ready",
    ),
);
const runTool = createToolRunner(store);
let cleanup: (() => void) | undefined;
let disposed = false;
function select(apiId: string, operationId: string) {
  if (window.innerWidth <= 600) collapsed.value = true;
  picker.value = { apiId, operationId };
}
async function buildTemplate(id: string) {
  busy.value = true;
  templatesOpen.value = false;
  const result = await createTemplate(id, runTool);
  if (result.isError) error.value = JSON.parse(result.content[0].text).error;
  busy.value = false;
}
async function readImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000)
      throw new Error("Workspace files must be under 1 MB.");
    importValue.value = JSON.parse(await file.text());
  } catch (e) {
    error.value = (e as Error).message;
  }
  (event.target as HTMLInputElement).value = "";
}
async function doImport() {
  try {
    const value = importValue.value;
    importValue.value = undefined;
    await store.importWorkspace(value);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function keyboard(event: KeyboardEvent) {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(
      (event.target as HTMLElement).tagName,
    ) &&
    !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    collapsed.value = false;
    setTimeout(
      () =>
        document
          .querySelector<HTMLInputElement>('[aria-label="Search APIs"]')
          ?.focus(),
      0,
    );
  }
}
onMounted(async () => {
  if (sharedEncoded) return;
  refreshTimer = setInterval(() => store.refreshDue(), 15000);
  document.addEventListener("keydown", keyboard);
  const restored = store.restore();
  cleanup = await registerTools(store);
  if (disposed) cleanup();
  await restored;
});
onBeforeUnmount(() => {
  disposed = true;
  clearInterval(refreshTimer);
  cleanup?.();
  document.removeEventListener("keydown", keyboard);
});
</script>
<template>
  <ShareView v-if="sharedEncoded" :encoded="sharedEncoded" />
  <template v-else>
    <div class="app-shell" :class="{ 'sidebar-collapsed': collapsed }">
      <header class="topbar">
        <a class="brand" href="#" aria-label="API Canvas home"
          ><span class="brand-mark"><PanelsTopLeft :size="20" /></span>API
          Canvas<span class="beta">BETA</span></a
        >
        <div class="topbar-center">
          <span class="tiny muted">YOUR DATA, IN VIEW</span>
        </div>
        <button class="agent-status" @click="toolsOpen = true">
          <span
            :class="['status-dot', { ready: webmcpStatus === 'available' }]"
          ></span
          >{{ webmcpStatus === "available" ? "Agent ready" : "Agent tools"
          }}<Code :size="15" />
        </button>
      </header>
      <DiscoverDrawer
        :collapsed="collapsed"
        @select="select"
        @close="collapsed = true"
        @custom="
          customEditId = undefined;
          customEditor = true;
        "
      />
      <main class="workspace">
        <div class="workspace-breadcrumb">
          <button
            class="icon-button"
            :aria-label="collapsed ? 'Open discovery' : 'Collapse discovery'"
            @click="collapsed = !collapsed"
          >
            <PanelLeftOpen v-if="collapsed" :size="18" /><PanelLeftClose
              v-else
              :size="18"
            /></button
          ><span>Personal workspace</span><span>/</span><span>Canvas</span
          ><span class="saved-label"
            ><Check v-if="store.savedOnDevice" :size="12" />
            {{
              store.savedOnDevice
                ? "Saved on this device"
                : "Changes are not saved"
            }}</span
          >
        </div>
        <DashboardManager />
        <p v-if="store.apiProposal" class="notice">
          An agent proposed {{ store.apiProposal.name }}.
          <button class="button" @click="customEditor = true">
            Review proposed API</button
          ><button class="text-button" @click="store.apiProposal = undefined">
            Dismiss
          </button>
        </p>
        <div class="workspace-data-actions">
          <button class="button" @click="editor.contentEditor = {}">
            Add content
          </button>
          <button class="button" @click="sourceDiscovery = true">
            Add public source
          </button>
          <button
            class="button"
            :disabled="!store.widgets.length"
            @click="composeOpen = true"
          >
            Connect data
          </button>
          <button
            class="button"
            :disabled="!store.widgets.length"
            @click="editor.questionScope = [...store.selectedIds]"
          >
            Ask about data
          </button>
          <button
            class="button"
            :disabled="!store.widgets.length"
            @click="addSummary"
          >
            Summarize page
          </button>
          <button
            class="button"
            :disabled="!store.widgets.length"
            @click="editor.contextOpen = true"
          >
            Use all page data
          </button>
          <button
            class="button"
            :disabled="!store.widgets.length"
            @click="editor.shareOpen = true"
          >
            Share / present
          </button>
        </div>
        <button class="text-button" @click="historyOpen = true">
          Request history
        </button>
        <RequestHistory v-if="historyOpen" @close="historyOpen = false" />
        <ContentEditor
          v-if="editor.contentEditor"
          v-bind="editor.contentEditor"
          @close="editor.contentEditor = undefined"
        />
        <AskCanvas
          v-if="editor.questionScope"
          :scope="editor.questionScope"
          :block-id="editor.questionBlockId"
          @close="
            editor.questionScope = undefined;
            editor.questionBlockId = undefined;
          "
        />
        <div class="workspace-title">
          <div>
            <div class="eyebrow">WORKSPACE</div>
            <input
              aria-label="Workspace title"
              :value="store.title"
              @change="store.rename(($event.target as HTMLInputElement).value)"
              maxlength="120"
            />
            <p>
              {{
                store.widgets.length
                  ? `${store.widgets.length} widgets · ${new Set(store.widgets.map((w) => w.invocation.apiId)).size} sources · One place to see it all.`
                  : "A blank canvas for your next question."
              }}
            </p>
          </div>
          <div class="workspace-actions">
            <label class="mode-switch"
              ><span class="sr-only">Default data mode for new widgets</span
              ><select
                :value="store.mode"
                @change="
                  store.setMode(
                    ($event.target as HTMLSelectElement).value as
                      'sample' | 'live',
                  )
                "
              >
                <option value="sample">Sample data</option>
                <option value="live">Live data</option>
              </select></label
            ><button
              class="icon-button"
              aria-label="Import workspace"
              title="Import workspace"
              @click="importInput?.click()"
            >
              <Upload :size="17" /></button
            ><button
              class="icon-button"
              aria-label="Export workspace"
              title="Export workspace"
              @click="
                download(
                  'api-canvas-workspace.json',
                  JSON.stringify(store.exportWorkspace(), null, 2),
                )
              "
            >
              <Download :size="17" /></button
            ><button class="button primary" @click="templatesOpen = true">
              <Plus :size="16" /> Add widgets
            </button>
          </div>
        </div>
        <div class="workspace-divider">
          <div class="view-label">
            <LayoutGrid :size="15" /> Canvas
            <span>{{ store.widgets.length }}</span>
          </div>
          <button
            v-if="store.widgets.length"
            class="text-button"
            :disabled="
              store.widgets.some((w) =>
                ['loading', 'refreshing'].includes(w.status),
              )
            "
            @click="store.refreshWidgets()"
          >
            <RefreshCw :size="13" /> Refresh all</button
          ><span v-else class="tiny muted"
            >Start with an idea. Build with real data.</span
          >
        </div>
        <p v-if="error || store.notice" role="alert" class="notice app-notice">
          {{ error || store.notice
          }}<button
            aria-label="Dismiss notice"
            @click="
              error = '';
              store.notice = '';
            "
          >
            ×
          </button>
        </p>
        <div v-if="!store.widgets.length" class="empty-workspace">
          <div class="empty-intro">
            <div class="empty-kicker">
              <span class="short-line"></span> THE WORLD HAS AN API
            </div>
            <h1>What would you like<br />to <span>see today?</span></h1>
            <p>
              Bring public data together. Turn a question into charts,<br
                class="desktop-break"
              />
              maps, and useful little windows on the world.
            </p>
          </div>
          <div class="template-grid">
            <button
              v-for="(template, i) in templates"
              :key="template.id"
              :class="['template-card', `template-${template.id}`]"
              :disabled="busy"
              @click="buildTemplate(template.id)"
            >
              <div class="template-art" aria-hidden="true">
                <template v-if="template.id === 'government'"
                  ><div class="mini-metric">
                    <span>FEDERAL DEBT</span><strong>$36.9T</strong
                    ><svg viewBox="0 0 180 50">
                      <path
                        d="M0 46 L18 40 32 43 50 28 72 32 95 24 112 27 140 9 160 15 180 2"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      />
                    </svg>
                  </div>
                  <div class="mini-weather">
                    <Globe :size="20" /><strong>24°</strong
                    ><small>WASHINGTON, DC</small>
                  </div></template
                ><template v-else-if="template.id === 'city'"
                  ><div class="mini-city">
                    <span>BALTIMORE</span>
                    <div class="skyline">
                      <i
                        v-for="j in 8"
                        :key="j"
                        :style="{ height: `${20 + ((j * 19) % 46)}px` }"
                      ></i>
                    </div>
                    <BookOpen :size="21" /></div></template
                ><template v-else
                  ><div class="mini-space">
                    <div class="planet"></div>
                    <Orbit :size="24" /><span>A DIFFERENT POINT OF VIEW</span>
                  </div></template
                ><span class="sample-watermark">Sample preview</span>
              </div>
              <div class="template-copy">
                <span class="eyebrow">{{ template.tag }}</span>
                <h2>{{ template.title }} <ArrowUpRight :size="17" /></h2>
                <p>{{ template.description }}</p>
                <span class="template-meta"
                  >{{ template.widgets.length }} widgets<span
                    >Use template <ArrowRight :size="13" /></span
                ></span>
              </div>
            </button>
          </div>
          <div class="empty-bottom">
            <div>
              <span class="step-number">01</span>
              <p>
                <strong>Pick your sources</strong
                ><span>Explore {{ apis.length }} public APIs in Discover.</span>
              </p>
            </div>
            <div>
              <span class="step-number">02</span>
              <p>
                <strong>Make it yours</strong
                ><span>Change the view. Keep the data.</span>
              </p>
            </div>
            <div>
              <span class="step-number">03</span>
              <p>
                <strong>Keep exploring</strong
                ><span>Refresh, export, or invite an agent.</span>
              </p>
            </div>
          </div>
        </div>
        <div v-else class="populated-workspace">
          <WorkspaceGrid />
          <button class="add-source-button" @click="templatesOpen = true">
            <Plus :size="16" /> Add another perspective
          </button>
          <div class="canvas-end">
            <span :class="['status-dot', { ready: allReady }]"></span
            >{{
              allReady
                ? "Everything is up to date"
                : "Your workspace is taking shape"
            }}<span>·</span
            >{{
              store.widgets.some((w) => w.content)
                ? "Local content and source attribution are shown on each card"
                : store.widgets.some((w) => w.invocation.mode === "sample")
                  ? "Sample values are illustrative"
                  : "Data loaded directly from public sources"
            }}
          </div>
        </div>
        <AgentComposer @tools="toolsOpen = true" />
      </main>
      <input
        ref="importInput"
        type="file"
        accept="application/json,.json"
        class="sr-only"
        aria-label="Workspace import file"
        @change="readImport"
      /><OperationPicker
        v-if="picker"
        :key="`${picker.apiId}/${picker.operationId}`"
        v-bind="picker"
        @close="picker = undefined"
        @edit="
          customEditId = $event;
          picker = undefined;
          customEditor = true;
        "
      /><ToolExplorer v-if="toolsOpen" @close="toolsOpen = false" /><ModalDialog
        v-if="templatesOpen"
        title="Add to your canvas"
        @close="templatesOpen = false"
        ><p class="muted">
          Start with a template, or choose a source in Discover. Templates add
          to your existing workspace.
        </p>
        <button
          class="template-option"
          v-for="template in templates"
          :key="template.id"
          @click="buildTemplate(template.id)"
        >
          <strong>{{ template.title }}</strong
          ><span
            >{{ template.widgets.length }} widgets <ArrowRight :size="15"
          /></span></button
        ><button
          class="button"
          @click="
            templatesOpen = false;
            collapsed = false;
          "
        >
          Browse individual sources
        </button></ModalDialog
      ><ModalDialog
        v-if="importValue !== undefined"
        title="Import workspace"
        @close="importValue = undefined"
        ><p>
          Import replaces the current canvas. Export your current workspace
          first if you want to keep it.
        </p>
        <div class="button-row">
          <button
            class="button"
            @click="
              download(
                'api-canvas-workspace.json',
                JSON.stringify(store.exportWorkspace(), null, 2),
              )
            "
          >
            Export current</button
          ><button class="button primary" @click="doImport">
            Replace and import
          </button>
        </div></ModalDialog
      >
    </div>
    <CustomApiEditor
      v-if="customEditor"
      :definition="
        discoveredDefinition ??
        store.apiProposal ??
        customApis.find((api) => api.id === customEditId)
      "
      @close="
        customEditor = false;
        discoveredDefinition = undefined;
      "
      @saved="
        discoveredDefinition = undefined;
        store.apiProposal = undefined;
        customEditor = false;
        picker = { apiId: $event, operationId: 'request' };
      "
    />
    <SourceDiscovery
      v-if="sourceDiscovery"
      @close="sourceDiscovery = false"
      @configure="
        discoveredDefinition = $event;
        sourceDiscovery = false;
        customEditor = true;
      "
    />
    <ComposeBlock v-if="composeOpen" @close="composeOpen = false" />
    <ModalDialog
      v-if="editor.contextOpen"
      title="All page data"
      wide
      @close="editor.contextOpen = false"
      ><p>
        Structured context includes source responses, selected fields, filters,
        connections, freshness, and block settings. Credential fields are
        removed. Large responses are explicitly bounded.
      </p>
      <JsonBlock :value="context" /><button
        class="button"
        @click="
          download('api-canvas-context.json', JSON.stringify(context, null, 2))
        "
      >
        Download page context
      </button></ModalDialog
    >
    <ModalDialog
      v-if="editor.shareOpen && shared"
      title="Share this workspace"
      @close="editor.shareOpen = false"
      ><p>
        This link contains a snapshot of the displayed data, source definitions,
        connections, filters, and layout. Anyone with the link can read it.
        Review the data before sharing.
      </p>
      <p v-for="warning in shared.warnings" :key="warning" class="notice">
        {{ warning }}
      </p>
      <label class="stacked-field"
        >Share link<input :value="shared.url" readonly aria-label="Share URL"
      /></label>
      <div class="button-row">
        <a
          class="button primary"
          :href="shared.url"
          target="_blank"
          rel="noopener"
          >Open clean share view</a
        ><button class="button" @click="copyShare">Copy share link</button>
      </div></ModalDialog
    >
    <ModalDialog
      v-if="editor.pendingDelete"
      title="Remove this block?"
      @close="editor.pendingDelete = undefined"
      ><p>
        Remove
        {{
          store.widgets.find((w) => w.id === editor.pendingDelete?.widgetId)
            ?.title
        }}? Connected blocks may lose their source.
      </p>
      <button class="button danger" @click="confirmRemove">
        Confirm remove block</button
      ><button class="button" @click="editor.pendingDelete = undefined">
        Keep block
      </button></ModalDialog
    >
    <ModalDialog
      v-if="editor.pendingDashboard"
      title="Confirm dashboard change"
      @close="editor.pendingDashboard = undefined"
      ><p>
        {{
          editor.pendingDashboard.action === "clear"
            ? "Clear all blocks from"
            : "Delete"
        }}
        {{
          store.dashboards.find(
            (d) => d.id === editor.pendingDashboard?.dashboardId,
          )?.title
        }}?
      </p>
      <button class="button danger" @click="confirmDashboard">
        Confirm dashboard change</button
      ><button class="button" @click="editor.pendingDashboard = undefined">
        Cancel
      </button></ModalDialog
    >
  </template>
</template>
