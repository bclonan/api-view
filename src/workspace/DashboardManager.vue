<script setup lang="ts">
import { ref } from "vue";
import { Plus, Settings2, Trash2, Undo2 } from "lucide-vue-next";
import { useWorkspace } from "../stores/workspace";
import ModalDialog from "../components/ModalDialog.vue";
const store = useWorkspace();
const action = ref<"new" | "manage" | "clear" | "delete">();
const name = ref("");
const target = ref("");
const revision = ref(0);
const busy = ref(false);
const error = ref("");
function open(next: typeof action.value) {
  action.value = next;
  target.value = store.id;
  revision.value = store.revision;
  name.value = next === "new" ? "Untitled dashboard" : store.title;
  error.value = "";
}
async function run(work: () => unknown | Promise<unknown>) {
  busy.value = true;
  error.value = "";
  try {
    await work();
    action.value = undefined;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function confirm() {
  return run(async () => {
    if (target.value !== store.id)
      throw new Error(
        "The active dashboard changed. Close this dialog and try again.",
      );
    if (action.value === "clear" || action.value === "delete")
      store.checkRevision(revision.value);
    if (action.value === "new") await store.newDashboard(name.value);
    else if (action.value === "clear") store.clearDashboard();
    else if (action.value === "delete")
      await store.deleteDashboard(target.value);
  });
}
</script>
<template>
  <div class="dashboard-bar">
    <label
      >Dashboard
      <select
        aria-label="Switch dashboard"
        :value="store.id"
        :disabled="busy"
        @change="
          run(() =>
            store.switchDashboard(($event.target as HTMLSelectElement).value),
          )
        "
      >
        <option
          v-for="dashboard in store.dashboards"
          :key="dashboard.id"
          :value="dashboard.id"
        >
          {{ dashboard.title }}
        </option>
      </select>
    </label>
    <button class="button" @click="open('new')">
      <Plus :size="14" /> New dashboard
    </button>
    <button
      class="icon-button"
      aria-label="Manage dashboard"
      title="Manage dashboard"
      @click="open('manage')"
    >
      <Settings2 :size="17" />
    </button>
    <button
      class="text-button"
      :disabled="!store.widgets.length"
      @click="open('clear')"
    >
      <Trash2 :size="13" /> Clear dashboard
    </button>
    <button
      v-if="store.cleared?.id === store.id && !store.widgets.length"
      class="text-button"
      @click="run(() => store.undoClear())"
    >
      <Undo2 :size="14" /> Undo clear
    </button>
  </div>
  <p v-if="error && !action" class="error-text" role="alert">{{ error }}</p>
  <ModalDialog
    v-if="action"
    :title="
      action === 'new'
        ? 'New dashboard'
        : action === 'clear'
          ? 'Clear dashboard?'
          : action === 'delete'
            ? 'Delete dashboard?'
            : 'Manage dashboard'
    "
    @close="action = undefined"
  >
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <template v-if="action === 'new'">
      <p>Your current dashboard stays saved on this device.</p>
      <label class="stacked-field"
        >Dashboard name<input
          v-model="name"
          maxlength="120"
          @keydown.enter="confirm"
      /></label>
      <button class="button primary" :disabled="busy" @click="confirm">
        Create dashboard
      </button>
    </template>
    <template v-else-if="action === 'manage'">
      <label class="stacked-field"
        >Dashboard name<input v-model="name" maxlength="120"
      /></label>
      <p class="muted">
        {{ store.widgets.length }} widgets. Saved in this browser on this
        device.
      </p>
      <div class="button-row">
        <button
          class="button primary"
          :disabled="busy"
          @click="run(() => store.rename(name))"
        >
          Rename dashboard
        </button>
        <button
          class="button"
          :disabled="busy"
          @click="run(() => store.duplicateDashboard())"
        >
          Duplicate dashboard
        </button>
        <button class="button danger" :disabled="busy" @click="open('delete')">
          Delete dashboard
        </button>
      </div>
    </template>
    <template v-else>
      <p v-if="action === 'clear'">
        Remove all {{ store.widgets.length }} widgets from "{{ store.title }}"?
        Other dashboards stay saved. You can undo this while this dashboard
        remains empty.
      </p>
      <p v-else>
        Delete "{{ store.title }}" and its saved configuration from this device?
        Export it first if you want to keep a copy.
      </p>
      <div class="button-row">
        <button class="button" @click="action = undefined">Cancel</button>
        <button class="button danger" :disabled="busy" @click="confirm">
          {{
            action === "clear" ? "Clear all widgets" : "Delete this dashboard"
          }}
        </button>
      </div>
    </template>
  </ModalDialog>
</template>
