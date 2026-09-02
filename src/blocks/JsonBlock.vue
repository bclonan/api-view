<script setup lang="ts">
import { computed, ref } from "vue";
const props = defineProps<{ value: unknown; label?: string; depth?: number }>();
const open = ref((props.depth ?? 0) < 1);
const limit = ref(50);
const entries = computed(() =>
  props.value && typeof props.value === "object"
    ? Object.entries(props.value)
    : [],
);
</script>
<template>
  <details
    v-if="value !== null && typeof value === 'object'"
    :open="open"
    class="json-node"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary>
      {{ label ?? "Response" }}
      <span class="muted">{{
        Array.isArray(value)
          ? `Array · ${value.length}`
          : `Object · ${Object.keys(value).length}`
      }}</span>
    </summary>
    <div v-if="open" class="json-children">
      <JsonBlock
        v-for="[key, v] in entries.slice(0, limit)"
        :key="key"
        :value="v"
        :label="String(key)"
        :depth="(depth ?? 0) + 1"
      />
      <button
        v-if="entries.length > limit"
        class="text-button"
        @click="limit += 50"
      >
        Show next {{ Math.min(50, entries.length - limit) }} entries
      </button>
    </div>
  </details>
  <div v-else class="json-leaf">
    <span>{{ label }}</span
    ><code>{{ JSON.stringify(value) ?? "undefined" }}</code>
  </div>
</template>
