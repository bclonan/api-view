<script setup lang="ts">
import { ref } from "vue";
import { useWorkspace } from "../stores/workspace";
import ModalDialog from "../components/ModalDialog.vue";
import { compatibleComponents } from "../blocks/definitions";
import { rowsOf } from "../runtime/normalize";
const emit = defineEmits<{ close: [] }>(),
  store = useWorkspace(),
  error = ref("");
async function add(envelopeId: string, type: any) {
  try {
    await store.addCard(envelopeId, { presentation: { type } });
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <ModalDialog title="Request history" @close="emit('close')"
    ><p>Reuse a fetched response in another view. This sends no new request.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!store.dataRequests.some((e) => e.dashboardId === store.id)">
      Run a request plan or use run_api to collect data here. Existing card
      responses can also be duplicated from their menu.
    </p>
    <article
      v-for="entry in store.dataRequests.filter(
        (e) => e.dashboardId === store.id,
      )"
      :key="entry.requestId"
      class="history-entry"
    >
      <h3>{{ entry.invocation.apiId }} / {{ entry.invocation.operationId }}</h3>
      <p>
        {{ rowsOf(entry.response.result.data).length }} records ·
        {{ entry.invocation.mode }}
      </p>
      <div class="view-suggestions">
        <button
          class="button"
          v-for="view in compatibleComponents(entry.response.result)
            .filter((c) => c.compatible)
            .slice(0, 5)"
          :key="view.id"
          :title="view.reason"
          @click="add(entry.response.result.id, view.id)"
        >
          Add {{ view.name }}
        </button>
      </div>
      <details>
        <summary>Request and schema</summary>
        <pre>{{
          JSON.stringify(
            {
              url: entry.response.requestUrl,
              structure: entry.response.result.structure,
              fields: entry.response.result.fields,
            },
            null,
            2,
          )
        }}</pre>
      </details>
    </article></ModalDialog
  >
</template>
