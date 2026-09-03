<script setup lang="ts">
import { computed, ref } from "vue";
import ModalDialog from "../components/ModalDialog.vue";
import BlockRenderer from "../blocks/BlockRenderer.vue";
import JsonBlock from "../blocks/JsonBlock.vue";
import { useWorkspace } from "../stores/workspace";
import {
  sourceFormats,
  type SourceFormat,
  type CustomApiConfig,
  type SemanticResult,
} from "../types";
const props = defineProps<{ definition?: CustomApiConfig }>();
const emit = defineEmits<{ close: []; saved: [apiId: string] }>();
const store = useWorkspace();
const name = ref(props.definition?.name ?? "My JSON data");
const id = props.definition?.id ?? `custom-${crypto.randomUUID().slice(0, 8)}`;
const baseUrl = ref(props.definition?.baseUrl ?? "https://example.com");
const endpoint = ref(props.definition?.endpoint ?? "/records");
const method = ref<CustomApiConfig["method"]>(
  props.definition?.method ?? "GET",
);
const responsePath = ref(
  props.definition ? (props.definition.responsePath ?? "") : "records",
);
const format = ref<SourceFormat>(props.definition?.format ?? "auto"),
  selector = ref(props.definition?.selector ?? ""),
  permitted = ref(props.definition?.permitted ?? false),
  attribution = ref(props.definition?.attribution ?? ""),
  license = ref(props.definition?.license ?? ""),
  refreshSeconds = ref(props.definition?.refreshSeconds ?? 300);
const pagination = ref(
    props.definition?.pagination
      ? JSON.stringify(props.definition.pagination, null, 2)
      : "",
  ),
  transforms = ref(JSON.stringify(props.definition?.transforms ?? [], null, 2));
const sensitiveConfirmed = ref(false);
const inputs = ref(JSON.stringify(props.definition?.inputs ?? {}, null, 2));
const query = ref(JSON.stringify(props.definition?.query ?? {}, null, 2));
const headers = ref(JSON.stringify(props.definition?.headers ?? {}, null, 2));
const body = ref(
  props.definition?.body === undefined
    ? ""
    : JSON.stringify(props.definition.body, null, 2),
);
const sample = ref(
  JSON.stringify(
    props.definition?.sampleResponse ?? {
      records: [
        {
          name: "Example county",
          population: 62000,
          details: { updated: "2026-09-02" },
        },
      ],
    },
    null,
    2,
  ),
);
const schema = ref(
  props.definition?.responseSchema
    ? JSON.stringify(props.definition.responseSchema, null, 2)
    : "",
);
const authentication = ref<"none" | "api-key">(
  props.definition?.authentication ?? "none",
);
const testArgs = ref("{}");
const error = ref("");
const busy = ref(false);
const preview = ref<SemanticResult>();
const previewRaw = ref<unknown>();
const configuration = computed<CustomApiConfig>(() => ({
  id,
  name: name.value,
  description: props.definition?.description,
  baseUrl: baseUrl.value,
  endpoint: endpoint.value,
  method: method.value,
  responsePath: responsePath.value,
  inputs: JSON.parse(inputs.value),
  query: JSON.parse(query.value),
  headers: JSON.parse(headers.value),
  ...(body.value.trim() ? { body: JSON.parse(body.value) } : {}),
  sampleResponse: JSON.parse(sample.value),
  ...(schema.value.trim() ? { responseSchema: JSON.parse(schema.value) } : {}),
  authentication: authentication.value,
  format: format.value,
  selector: selector.value || undefined,
  permitted: permitted.value,
  attribution: attribution.value,
  license: license.value,
  refreshSeconds: refreshSeconds.value,
  pagination: pagination.value.trim()
    ? JSON.parse(pagination.value)
    : undefined,
  transforms: JSON.parse(transforms.value),
}));
async function test(mode: "sample" | "live") {
  busy.value = true;
  error.value = "";
  preview.value = undefined;
  try {
    if (mode === "live" && method.value !== "GET" && !sensitiveConfirmed.value)
      throw new Error("Confirm the live request before sending this method.");
    const result = await store.testCustomApi(
      configuration.value,
      JSON.parse(testArgs.value),
      mode,
    );
    preview.value = result.result;
    previewRaw.value = result.rawResponse;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function save() {
  try {
    const saved = store.defineCustomApi(configuration.value);
    emit("saved", saved.apiId);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <ModalDialog
    :title="definition ? 'Edit custom API' : 'Add API or local data'"
    @close="emit('close')"
  >
    <p>
      Configure a public endpoint or paste local data as a sample response. Both
      use the same fields, bindings, and components.
    </p>
    <div class="form-grid">
      <label
        >Name<input v-model="name" aria-label="API name" maxlength="120"
      /></label>
      <label
        >Base URL<input
          v-model="baseUrl"
          aria-label="API base URL"
          placeholder="https://api.example.com"
      /></label>
      <label
        >Endpoint<input
          v-model="endpoint"
          aria-label="API endpoint"
          placeholder="/records/{id}"
      /></label>
      <label
        >Method<select v-model="method" aria-label="HTTP method">
          <option
            v-for="m in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']"
            :key="m"
          >
            {{ m }}
          </option>
        </select></label
      >
      <label
        >Dataset path<input
          v-model="responsePath"
          aria-label="Response dataset path"
          placeholder="results, data.items, or blank for the whole response"
      /></label>
    </div>
    <details class="custom-settings">
      <summary>Source format, refresh, and mapping</summary>
      <div class="form-grid">
        <label
          >Source format<select v-model="format">
            <option v-for="f in sourceFormats" :key="f" :value="f">
              {{ f }}
            </option>
          </select></label
        ><label>CSS selector<input v-model="selector" maxlength="500" /></label
        ><label
          >Refresh interval in seconds<input
            v-model.number="refreshSeconds"
            type="number"
            min="30"
            max="86400" /></label
        ><label
          >Attribution<input v-model="attribution" maxlength="500" /></label
        ><label>License<input v-model="license" maxlength="200" /></label>
      </div>
      <label class="check-label"
        ><input v-model="permitted" type="checkbox" />I have permission to read
        and reuse this webpage's structured data</label
      >
      <label class="stacked-field"
        >Pagination settings<textarea
          v-model="pagination"
          aria-label="Pagination JSON"
          rows="4"
          placeholder='{"mode":"page","parameter":"page","start":1,"maxPages":3}'
        />
      </label>
      <p class="tiny muted">
        Use page, offset, cursor, or next. Requests stop after five pages.
        Cursor and next modes require nextPath. Automatic refresh only sends GET
        while this tab is visible.
      </p>
      <label class="stacked-field"
        >Source transform steps<textarea
          v-model="transforms"
          aria-label="Source transforms JSON"
          rows="4"
        />
      </label>
    </details>
    <label class="stacked-field"
      >Sample response<textarea
        v-model="sample"
        aria-label="Sample response JSON"
        rows="8"
        spellcheck="false"
      ></textarea>
    </label>
    <details class="custom-settings">
      <summary>Request variables and headers</summary>
      <p class="tiny muted">
        Use {name} in the endpoint, query, headers, or JSON body. Declare each
        variable below. Settings stay on this device and appear in exports. Do
        not store secrets here.
      </p>
      <label class="stacked-field"
        >Input definitions<textarea
          v-model="inputs"
          aria-label="Input definitions JSON"
          rows="4"
          spellcheck="false"
        ></textarea>
      </label>
      <p class="tiny muted">
        Example: {"q":{"type":"string","label":"Search","required":true}}
      </p>
      <label class="stacked-field"
        >Query parameters<textarea
          v-model="query"
          aria-label="Query parameters JSON"
          rows="3"
          spellcheck="false"
        ></textarea>
      </label>
      <p class="tiny muted">Example: {"search":"{q}"}</p>
      <label class="stacked-field"
        >Headers<textarea
          v-model="headers"
          aria-label="Request headers JSON"
          rows="3"
          spellcheck="false"
        ></textarea>
      </label>
      <label v-if="method !== 'GET'" class="stacked-field"
        >JSON body<textarea
          v-model="body"
          aria-label="Request body JSON"
          rows="4"
          spellcheck="false"
        ></textarea>
      </label>
      <label class="stacked-field"
        >Authentication metadata<select v-model="authentication">
          <option value="none">No authentication</option>
          <option value="api-key">Endpoint requires an API key</option>
        </select></label
      >
      <label class="stacked-field"
        >Optional response schema<textarea
          v-model="schema"
          aria-label="Response schema JSON"
          rows="4"
          spellcheck="false"
        ></textarea>
      </label>
    </details>
    <details class="custom-settings">
      <summary>Test this definition</summary>
      <label class="stacked-field"
        >Test arguments<textarea
          v-model="testArgs"
          aria-label="Test arguments JSON"
          rows="3"
        ></textarea>
      </label>
      <p class="tiny muted">
        Live tests send a {{ method }} request directly to the configured URL.
        The endpoint must allow browser access. Samples make no network request.
      </p>
      <label v-if="method !== 'GET'" class="check-label"
        ><input v-model="sensitiveConfirmed" type="checkbox" />I approve sending
        this {{ method }} request to this endpoint</label
      >
      <div class="button-row">
        <button class="button" :disabled="busy" @click="test('sample')">
          Preview sample</button
        ><button class="button" :disabled="busy" @click="test('live')">
          Test {{ method }} request
        </button>
      </div>
      <div v-if="preview" class="custom-preview">
        <BlockRenderer :result="preview" :presentation="{ type: 'auto' }" />
        <details>
          <summary>Original response</summary>
          <JsonBlock :value="previewRaw" />
        </details>
      </div>
    </details>
    <p v-if="error" role="alert" class="error-text">{{ error }}</p>
    <div class="button-row">
      <button class="button primary" :disabled="busy" @click="save">
        Save API</button
      ><button class="button" @click="emit('close')">Cancel</button>
    </div>
  </ModalDialog>
</template>
