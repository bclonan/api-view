<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { detectValue } from "../runtime/detectValue";
import type { SemanticValueType } from "../types";
const props = defineProps<{
  value: unknown;
  semanticType?: SemanticValueType;
  fieldKey?: string;
}>();
const type = computed(
  () =>
    props.semanticType ??
    detectValue({ key: props.fieldKey, value: props.value }).type,
);
const failedImage = ref(false);
const safeUrl = computed(() => {
  try {
    const url = new URL(String(props.value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
});
const hostname = computed(() =>
  safeUrl.value ? new URL(safeUrl.value).hostname : "",
);
watch(
  () => props.value,
  () => {
    failedImage.value = false;
  },
);
const formatted = computed(() => {
  const v = props.value;
  if (v === undefined || v === null || v === "") return "Not available";
  if (type.value === "boolean") return v ? "Yes" : "No";
  if (type.value === "currency")
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(v));
  if (type.value === "percent") return `${Number(v).toLocaleString()}%`;
  if (type.value === "number" || type.value === "integer")
    return Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (type.value === "date")
    return new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric", year: "numeric" },
    );
  if (type.value === "datetime")
    return new Date(String(v)).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  if (type.value === "duration" && typeof v === "number")
    return `${v.toLocaleString()} s`;
  if (type.value === "coordinate" && Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
});
</script>
<template>
  <img
    v-if="type === 'image' && safeUrl && !failedImage"
    :src="safeUrl"
    :alt="fieldKey || 'Source image'"
    class="value-image"
    loading="lazy"
    referrerpolicy="no-referrer"
    @error="failedImage = true"
  />
  <a
    v-else-if="safeUrl && ['url', 'image', 'audio', 'video'].includes(type)"
    :href="safeUrl"
    target="_blank"
    rel="noopener noreferrer"
    >{{ hostname }} ↗</a
  >
  <a
    v-else-if="
      type === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
    "
    :href="`mailto:${encodeURIComponent(String(value))}`"
    >{{ value }}</a
  >
  <span
    v-else
    :class="{
      badge: type === 'category' || type === 'boolean',
      muted: value === null || value === undefined,
    }"
    >{{ formatted }}</span
  >
</template>
