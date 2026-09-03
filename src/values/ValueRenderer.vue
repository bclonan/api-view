<script setup lang="ts">
import { computed, ref, watch, inject, type ComputedRef } from "vue";
import { detectValue, isYearField } from "../runtime/detectValue";
import type { SemanticValueType } from "../types";
import type { ImageCredit } from "../runtime/imageCredits";
import { isLocalObjectUrl } from "../runtime/localFiles";
const props = defineProps<{
  value: unknown;
  semanticType?: SemanticValueType;
  fieldKey?: string;
}>();
const emit = defineEmits<{ unavailable: [] }>();
const type = computed(
  () =>
    props.semanticType ??
    detectValue({ key: props.fieldKey, value: props.value }).type,
);
const failedImage = ref(false);
const credits = inject<ComputedRef<Map<string, ImageCredit>>>(
  "api-canvas-image-credits",
  computed(() => new Map()),
);
const credit = computed(() =>
  safeUrl.value ? credits.value.get(safeUrl.value) : undefined,
);
const currency = inject<ComputedRef<string>>(
  "api-canvas-currency",
  computed(() => ""),
);
const safeUrl = computed(() => {
  try {
    const url = new URL(String(props.value));
    return ["https:", "http:"].includes(url.protocol) ||
      isLocalObjectUrl(props.value)
      ? url.href
      : undefined;
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
  if (
    ["currency", "percent", "measurement"].includes(type.value) &&
    typeof v === "string" &&
    /[$€£%a-z°]/i.test(v)
  )
    return v;
  if (type.value === "currency")
    return new Intl.NumberFormat("en-US", {
      ...(currency.value
        ? ({ style: "currency", currency: currency.value } as const)
        : {}),
      maximumFractionDigits: 2,
    }).format(Number(v));
  if (type.value === "percent") return `${Number(v).toLocaleString()}%`;
  if (type.value === "number" || type.value === "integer")
    return isYearField(props.fieldKey ?? "")
      ? String(v)
      : Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (type.value === "date")
    return new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric", year: "numeric" },
    );
  if (type.value === "datetime")
    return new Date(
      typeof v === "number" ? (v < 100000000000 ? v * 1000 : v) : String(v),
    ).toLocaleString("en-US", {
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
  <span
    v-if="type === 'image' && safeUrl && !failedImage"
    class="credited-image"
  >
    <img
      :src="safeUrl"
      :alt="fieldKey || 'Source image'"
      class="value-image"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="
        failedImage = true;
        emit('unavailable');
      "
    />
    <span v-if="credit" class="image-credit">
      <a
        v-if="credit.authorUrl && credit.name"
        :href="credit.authorUrl"
        target="_blank"
        rel="noopener noreferrer"
        >{{ credit.name }}</a
      >
      <span v-else-if="credit.name">{{ credit.name }}</span>
      <span v-if="credit.name && credit.source"> · </span>
      <a
        v-if="credit.sourceUrl"
        :href="credit.sourceUrl"
        target="_blank"
        rel="noopener noreferrer"
        >{{ credit.source || "Image source" }}</a
      >
      <span v-else>{{ credit.source }}</span>
      <span v-if="credit.license"> · {{ credit.license }}</span>
    </span>
  </span>
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
