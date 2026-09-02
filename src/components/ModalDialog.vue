<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { X } from "lucide-vue-next";
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let previous: Element | null = null;
onMounted(() => {
  previous = document.activeElement;
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  if (previous instanceof HTMLElement) previous.focus();
});
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      :class="['modal', { wide }]"
      :aria-label="title"
      @cancel.prevent="emit('close')"
      @click="
        (e) => {
          if (e.target === dialog) {
            const r = dialog!.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              emit('close');
          }
        }
      "
    >
      <header>
        <h2>{{ title }}</h2>
        <button
          class="icon-button"
          aria-label="Close dialog"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </header>
      <div class="modal-content"><slot /></div></dialog
  ></Teleport>
</template>
