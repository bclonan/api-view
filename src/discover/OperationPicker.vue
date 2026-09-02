<script setup lang="ts">
import { computed, ref } from "vue";
import { getOperation } from "../api/registry";
import { useWorkspace } from "../stores/workspace";
import {
  presentations,
  type PresentationType,
  type Row,
  type DataMode,
} from "../types";
import InputForm from "../widgets/InputForm.vue";
import ModalDialog from "../components/ModalDialog.vue";
import ApiIcon from "../components/ApiIcon.vue";
const props = defineProps<{ apiId: string; operationId: string }>();
const emit = defineEmits<{ close: [] }>();
const source = computed(() => getOperation(props.apiId, props.operationId));
const store = useWorkspace();
const presentation = ref<PresentationType>("auto");
const mode = ref<DataMode>(source.value.api.liveNotice ? "sample" : store.mode);
const error = ref("");
const busy = ref(false);
async function add(args: Row) {
  if (busy.value) return;
  busy.value = true;
  try {
    const pending = store.createWidget({
      apiId: props.apiId,
      operationId: props.operationId,
      arguments: args,
      presentation: presentation.value,
      mode: mode.value,
    });
    emit("close");
    await pending;
  } catch (e) {
    store.notice = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <ModalDialog :title="source.operation.title" @close="emit('close')"
    ><div class="operation-intro">
      <span class="api-icon"
        ><ApiIcon :name="source.api.icon" :size="24"
      /></span>
      <div>
        <strong>{{ source.api.name }}</strong>
        <p>{{ source.operation.description }}</p>
      </div>
    </div>
    <div class="operation-badges">
      <span>{{
        source.api.authentication === "api-key"
          ? "API key required for live data"
          : "No authentication"
      }}</span
      ><span>HTTPS</span
      ><a :href="source.api.docs" target="_blank" rel="noopener noreferrer"
        >Documentation ↗</a
      >
    </div>
    <div class="form-grid">
      <label
        >Data source<select v-model="mode" aria-label="Data source">
          <option value="sample">Sample data</option>
          <option v-if="!source.api.liveNotice" value="live">
            Live API request
          </option>
        </select></label
      ><label
        >Visualization<select v-model="presentation" aria-label="Visualization">
          <option v-for="p in presentations" :key="p" :value="p">
            {{ p === "auto" ? "Automatic" : p.replace(/-/g, " ") }}
          </option>
        </select></label
      >
    </div>
    <p class="notice" v-if="source.api.liveNotice">
      {{ source.api.liveNotice }}
    </p>
    <p class="notice" v-if="mode === 'sample'">
      Sample data demonstrates the layout. Values are illustrative and may not
      match your inputs.
    </p>
    <p class="tiny muted" v-else>
      Live requests go directly to this provider from your browser.
    </p>
    <p v-if="error" class="error-text">{{ error }}</p>
    <InputForm
      :operation="source.operation"
      :api-id="apiId"
      :allow-pending="true"
      @submit="add"
    />
    <p class="tiny muted">
      You can leave required fields empty and finish them in the widget.
    </p></ModalDialog
  >
</template>
