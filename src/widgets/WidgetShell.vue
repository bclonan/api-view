<script setup lang="ts">
import { computed, ref } from "vue";
import {
  RefreshCw,
  MoreHorizontal,
  Settings2,
  Copy,
  Download,
  Trash2,
  X,
  AlertCircle,
} from "lucide-vue-next";
import { useWorkspace } from "../stores/workspace";
import { getOperation } from "../api/registry";
import {
  presentations,
  type Widget,
  type PresentationType,
  type Row,
} from "../types";
import BlockRenderer from "../blocks/BlockRenderer.vue";
import TableBlock from "../blocks/TableBlock.vue";
import JsonBlock from "../blocks/JsonBlock.vue";
import ApiIcon from "../components/ApiIcon.vue";
import InputForm from "./InputForm.vue";
import BindingEditor from "./BindingEditor.vue";
import { compatibleComponents } from "../blocks/definitions";
import { discoverFields, flattenFields } from "../runtime/fields";
import { rowsOf } from "../runtime/normalize";
import { download, requestCode } from "../runtime/download";
const props = defineProps<{ widget: Widget }>();
const store = useWorkspace();
const display = computed(() => store.resultForWidget(props.widget.id));
const components = computed(() => compatibleComponents(display.value.result));
const boundSources = computed(() => [
  ...new Set(display.value.provenance.map((entry) => entry.apiId)),
]);
const dataModeLabel = computed(() => {
  const modes = new Set(
    display.value.provenance.map(
      (entry) =>
        store.widgets.find((w) => w.id === entry.sourceId)?.invocation.mode,
    ),
  );
  if (modes.size > 1) return "Live and sample data";
  return (
    modes.size ? modes.has("sample") : props.widget.invocation.mode === "sample"
  )
    ? "Sample data"
    : "Live request";
});
const rawFields = computed(() =>
  flattenFields(discoverFields(props.widget.rawResponse, false)),
);
const menu = ref(false);
const settings = ref(false);
const tab = ref("Interface");
const error = ref("");
const source = computed(() =>
  getOperation(
    props.widget.invocation.apiId,
    props.widget.invocation.operationId,
  ),
);
const busy = computed(() =>
  ["loading", "refreshing"].includes(props.widget.status),
);
const selected = computed(() => props.widget.presentation.type);
const resolved = computed(() =>
  selected.value === "auto"
    ? (display.value.result?.suggestedPresentations[0] ??
      source.value.operation.preferred)
    : selected.value,
);
const url = computed(
  () =>
    props.widget.requestUrl ??
    source.value.operation.buildUrl(props.widget.invocation.arguments),
);
const requestOptions = computed(() => ({
  method: source.value.operation.method ?? "GET",
  ...source.value.operation.buildRequest?.(props.widget.invocation.arguments),
}));
async function configure(args: Row) {
  try {
    await store.updateWidget(props.widget.id, { arguments: args });
    settings.value = false;
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function transform(value: PresentationType) {
  try {
    await store.transformWidget(props.widget.id, {
      ...props.widget.presentation,
      type: value,
    });
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function setField(key: "xField" | "yField", value: string) {
  try {
    await store.transformWidget(props.widget.id, {
      ...props.widget.presentation,
      [key]: value || undefined,
    });
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function duplicate() {
  menu.value = false;
  try {
    await store.duplicateCard(props.widget.id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function exportData() {
  download(
    `${props.widget.title.replace(/[^a-z0-9]/gi, "-")}.json`,
    JSON.stringify(props.widget.rawResponse ?? null, null, 2),
  );
  menu.value = false;
}
async function selectField(key: string, checked: boolean) {
  const fields =
    props.widget.presentation.fields ??
    display.value.result?.fields.map((f) => f.key) ??
    [];
  try {
    await store.transformWidget(props.widget.id, {
      ...props.widget.presentation,
      fields: checked
        ? [...new Set([...fields, key])]
        : fields.filter((f) => f !== key),
    });
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function setProperty(
  key: "compact" | "showSource" | "numberFormat",
  value: boolean | string,
) {
  try {
    await store.updateWidget(props.widget.id, {
      presentation: {
        props: { ...props.widget.presentation.props, [key]: value },
      },
    });
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <article
    class="widget"
    :class="{ 'widget-compact': widget.presentation.props?.compact }"
    :style="{ '--widget-span': widget.width }"
    :data-widget-id="widget.id"
    :data-status="widget.status"
    :aria-label="widget.title"
    :aria-busy="busy"
  >
    <header class="widget-header">
      <input
        type="checkbox"
        class="card-select"
        :aria-label="`Select ${widget.title}`"
        :checked="store.selectedIds.includes(widget.id)"
        @change="
          store.selectCards(
            ($event.target as HTMLInputElement).checked
              ? [...store.selectedIds, widget.id]
              : store.selectedIds.filter((id) => id !== widget.id),
          )
        "
      />
      <span class="source-icon"
        ><ApiIcon :name="source.api.icon" :size="18"
      /></span>
      <div class="widget-heading">
        <h2>{{ widget.title }}</h2>
        <p v-if="widget.presentation.props?.showSource !== false">
          {{
            boundSources.length > 1
              ? `${boundSources.length} sources`
              : source.api.name
          }}<span class="source-dot">·</span>{{ dataModeLabel }}
        </p>
      </div>
      <button
        class="icon-button"
        :aria-label="`Refresh ${widget.title}`"
        :disabled="busy"
        @click="store.refreshWidget(widget.id)"
      >
        <RefreshCw :size="15" :class="{ spinning: busy }" />
      </button>
      <div class="menu-anchor">
        <button
          class="icon-button"
          :aria-label="`Options for ${widget.title}`"
          :aria-expanded="menu"
          @click="menu = !menu"
        >
          <MoreHorizontal :size="19" />
        </button>
        <div v-if="menu" class="widget-menu" @keydown.esc="menu = false">
          <button
            @click="
              settings = !settings;
              menu = false;
            "
          >
            <Settings2 :size="14" /> Configure inputs</button
          ><button
            @click="
              tab = 'Presentation';
              menu = false;
            "
          >
            <Settings2 :size="14" /> Change visualization</button
          ><button
            v-for="view in ['Data', 'Fields', 'Request', 'Response', 'Code']"
            :key="view"
            @click="
              tab = view;
              menu = false;
            "
          >
            Show {{ view.toLowerCase() }}</button
          ><button @click="duplicate"><Copy :size="14" /> Duplicate</button
          ><button
            @click="
              store.moveWidget(widget.id, 0);
              menu = false;
            "
          >
            Move to top</button
          ><button
            :disabled="widget.rawResponse === undefined"
            @click="exportData"
          >
            <Download :size="14" /> Export data</button
          ><button class="danger" @click="store.removeWidget(widget.id)">
            <Trash2 :size="14" /> Remove
          </button>
        </div>
      </div>
    </header>
    <nav class="widget-tabs" aria-label="Widget views">
      <button
        v-for="view in ['Interface', 'Data', 'Request', 'Code']"
        :key="view"
        :class="{ active: tab === view }"
        @click="tab = view"
      >
        {{ view }}</button
      ><button
        v-if="!['Interface', 'Data', 'Request', 'Code'].includes(tab)"
        class="active"
      >
        {{ tab }}
      </button>
    </nav>
    <div class="widget-content">
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <div
        v-if="settings || widget.status === 'needs-input'"
        class="widget-settings"
      >
        <div class="settings-title">
          <h3>
            {{
              widget.status === "needs-input"
                ? "A little more information"
                : "Configure inputs"
            }}
          </h3>
          <button
            v-if="settings && widget.status !== 'needs-input'"
            class="icon-button"
            aria-label="Close settings"
            @click="settings = false"
          >
            <X :size="16" />
          </button>
        </div>
        <p class="muted" v-if="widget.status === 'needs-input'">
          Complete the inputs below to load this widget.
        </p>
        <InputForm
          :key="JSON.stringify(widget.invocation.arguments)"
          :operation="source.operation"
          :api-id="source.api.id"
          :initial="widget.invocation.arguments"
          submit-label="Load widget"
          @submit="configure"
        />
      </div>
      <div v-else-if="tab === 'Presentation'" class="presentation-settings">
        <label
          >Visualization<select
            aria-label="Visualization"
            :value="selected"
            @change="
              transform(
                ($event.target as HTMLSelectElement).value as PresentationType,
              )
            "
          >
            <option v-for="p in presentations" :value="p" :key="p">
              {{
                p === "auto"
                  ? `Automatic · ${resolved ?? "detect from data"}`
                  : `${p.replace(/-/g, " ")}${components.find((c) => c.id === p)?.compatible === false ? " · needs different fields" : ""}`
              }}
            </option>
          </select></label
        ><label
          >Width<select
            aria-label="Width"
            :value="widget.width"
            @change="
              store.updateWidget(widget.id, {
                width: Number(($event.target as HTMLSelectElement).value),
              })
            "
          >
            <option v-for="n in [3, 4, 6, 8, 12]" :value="n" :key="n">
              {{ n === 12 ? "Full width" : `${n} of 12 columns` }}
            </option>
          </select></label
        ><label
          v-for="fieldKey in ['xField', 'yField'] as const"
          :key="fieldKey"
          >{{
            fieldKey === "xField"
              ? "Horizontal axis / category"
              : "Value / measure"
          }}<select
            :aria-label="
              fieldKey === 'xField'
                ? 'Horizontal axis / category'
                : 'Value / measure'
            "
            :value="widget.presentation[fieldKey] ?? ''"
            @change="
              setField(fieldKey, ($event.target as HTMLSelectElement).value)
            "
          >
            <option value="">Automatic</option>
            <option
              v-for="f in display.result?.fields"
              :key="f.key"
              :value="f.key"
            >
              {{ f.label }}
            </option>
          </select></label
        >
        <label
          >Number format<select
            :value="widget.presentation.props?.numberFormat ?? 'compact'"
            @change="
              setProperty(
                'numberFormat',
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option value="compact">Compact</option>
            <option value="standard">Full number</option>
          </select></label
        >
        <label class="check-label"
          ><input
            type="checkbox"
            :checked="widget.presentation.props?.compact"
            @change="
              setProperty(
                'compact',
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          Compact spacing</label
        >
        <label class="check-label"
          ><input
            type="checkbox"
            :checked="widget.presentation.props?.showSource !== false"
            @change="
              setProperty(
                'showSource',
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          Show source</label
        >
        <label
          v-if="
            ['line-chart', 'area-chart', 'bar-chart'].includes(resolved ?? '')
          "
          >Chart series, up to four<select
            multiple
            aria-label="Chart series"
            :value="widget.presentation.series ?? []"
            @change="
              store.transformWidget(widget.id, {
                ...widget.presentation,
                series: Array.from(
                  ($event.target as HTMLSelectElement).selectedOptions,
                )
                  .map((o) => o.value)
                  .slice(0, 4),
              })
            "
          >
            <option
              v-for="field in display.result?.fields.filter((f) =>
                [
                  'number',
                  'integer',
                  'currency',
                  'percent',
                  'measurement',
                ].includes(f.type),
              )"
              :key="field.key"
              :value="field.key"
            >
              {{ field.label }}
            </option>
          </select></label
        >
        <fieldset class="field-selection">
          <legend>Visible fields</legend>
          <label
            v-for="field in display.result?.fields"
            :key="field.key"
            class="check-label"
            ><input
              type="checkbox"
              :checked="
                widget.presentation.fields === undefined ||
                widget.presentation.fields.includes(field.key)
              "
              @change="
                selectField(
                  field.key,
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />{{ field.label }} <small>{{ field.type }}</small></label
          >
        </fieldset>
        <BindingEditor :key="widget.id" :widget="widget" />
        <p class="tiny muted">
          Changes use the data already loaded. No new request.
        </p>
      </div>
      <div v-else-if="tab === 'Request'" class="request-view">
        <span class="method">{{ source.operation.method ?? "GET" }}</span
        ><a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a>
        <h3>Inputs</h3>
        <JsonBlock :value="widget.invocation.arguments" />
        <template v-if="source.operation.buildRequest"
          ><h3>Headers</h3>
          <JsonBlock :value="requestOptions.headers ?? {}" /><template
            v-if="requestOptions.body"
            ><h3>Body</h3>
            <JsonBlock :value="JSON.parse(requestOptions.body)" /></template
        ></template>
        <p class="tiny muted">
          {{ widget.durationMs ?? 0 }} ms ·
          {{
            widget.invocation.mode === "sample"
              ? "Sample fixture. This URL was not requested."
              : "Direct browser request. No proxy."
          }}
        </p>
        <a :href="source.api.docs" target="_blank" rel="noopener noreferrer"
          >Read API documentation ↗</a
        >
      </div>
      <pre
        v-else-if="tab === 'Code'"
        class="code-view"
      ><code>{{ requestCode(url, requestOptions) }}</code></pre>
      <JsonBlock v-else-if="tab === 'Response'" :value="widget.rawResponse" />
      <div v-else-if="tab === 'Fields'" class="field-inspector">
        <h3>Suggested views</h3>
        <div class="view-suggestions">
          <button
            v-for="view in components.filter((c) => c.compatible).slice(0, 5)"
            :key="view.id"
            class="button"
            :title="view.reason"
            @click="transform(view.id)"
          >
            {{ view.name }} · {{ view.score }}
          </button>
        </div>
        <p
          v-for="view in components.filter((c) => c.compatible).slice(0, 3)"
          :key="view.id"
          class="tiny muted"
        >
          {{ view.name }}: {{ view.reason }}
        </p>
        <p class="tiny muted">
          Dataset path: {{ widget.result?.structure?.collectionPath ?? "$" }}.
          {{ widget.result?.structure?.recordCount }} records.
        </p>
        <h3>Original response fields</h3>
        <p class="tiny muted">
          Paths describe values in the original response. [] means an array
          item. Use [0] for its first item.
        </p>
        <ul>
          <li v-for="field in rawFields" :key="field.key">
            <code>{{ field.path }}</code
            ><span
              >{{ field.primitiveType }} / {{ field.semanticType ?? field.type
              }}{{ field.nullable ? " · nullable" : "" }}</span
            ><small v-if="field.sample !== undefined">{{ field.sample }}</small>
          </li>
        </ul>
        <h3 v-if="display.provenance.length">Bound sources</h3>
        <ul>
          <li v-for="entry in display.provenance" :key="entry.slot">
            <strong>{{ entry.slot }}</strong
            ><span>{{ entry.apiId }} / {{ entry.operationId }}</span
            ><code>{{ entry.origin }} · {{ entry.path || "$" }}</code
            ><small>{{ entry.invokedAt ?? "Not loaded" }}</small>
          </li>
        </ul>
      </div>
      <div
        v-else-if="widget.status === 'loading'"
        class="loading-block"
        role="status"
      >
        <span class="sr-only">Loading {{ widget.title }}</span>
        <div></div>
        <div></div>
        <div></div>
      </div>
      <div
        v-else-if="widget.status === 'error'"
        class="error-block"
        role="alert"
      >
        <AlertCircle :size="24" />
        <h3>{{ widget.error?.title }}</h3>
        <p>{{ widget.error?.message }}</p>
        <p v-if="widget.error?.retryAfter">
          Retry after {{ widget.error.retryAfter }} seconds.
        </p>
        <div class="button-row">
          <button class="button" @click="store.refreshWidget(widget.id)">
            Retry request</button
          ><button
            v-if="widget.invocation.mode === 'live'"
            class="button"
            @click="store.updateWidget(widget.id, { mode: 'sample' })"
          >
            Use sample data
          </button>
        </div>
        <button class="text-button" @click="settings = true">
          Edit inputs
        </button>
      </div>
      <TableBlock
        v-else-if="tab === 'Data' && display.result"
        :rows="rowsOf(display.result.data)"
        :fields="display.result.fields"
      />
      <BlockRenderer
        v-else-if="display.result"
        :result="display.result"
        :presentation="widget.presentation"
      />
      <div v-else class="empty-block">
        <h3>Ready when you are</h3>
        <button class="button primary" @click="store.refreshWidget(widget.id)">
          Load data
        </button>
      </div>
      <p
        v-for="issue in display.issues"
        :key="issue"
        class="notice"
        role="status"
      >
        {{ issue }}
      </p>
    </div>
    <footer class="widget-footer">
      <span
        :class="['status-dot', widget.status === 'ready' ? 'ready' : '']"
      ></span
      ><span>{{
        widget.status === "refreshing"
          ? "Refreshing..."
          : widget.status === "ready"
            ? widget.invocation.mode === "sample"
              ? "Illustrative sample"
              : `Updated ${new Date(widget.refreshedAt!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : widget.status.replace(/-/g, " ")
      }}</span
      ><button @click="tab = 'Presentation'">
        {{ resolved?.replace(/-/g, " ") ?? "automatic" }}
        <Settings2 :size="12" />
      </button>
    </footer>
  </article>
</template>
