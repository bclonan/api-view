<script setup lang="ts">
import { ref } from "vue";
const props = defineProps<{ text: string; label?: string }>();
const feedback = ref("");
async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    feedback.value = "Copied";
  } catch {
    feedback.value = "Copy unavailable. Select the displayed text.";
  }
}
</script>
<template>
  <span class="copy-control"
    ><button class="button" @click="copy">{{ label ?? "Copy" }}</button
    ><span role="status">{{ feedback }}</span></span
  >
</template>
