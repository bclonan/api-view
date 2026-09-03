<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { NormalizedError, Row } from "../types";
import { embedSource } from "../runtime/embeds";
const props = defineProps<{ row: Row; kind?: string }>();
const emit = defineEmits<{ issue: [value?: NormalizedError] }>();
const source = computed(() => embedSource(props.row, props.kind));
const active = ref(source.value.kind !== "iframe"),
  failure = ref("");
const attempt = ref(0);
watch(source, () => {
  active.value = source.value.kind !== "iframe";
  failure.value = "";
  emit("issue", undefined);
});
function play() {
  active.value = true;
  failure.value = "";
  attempt.value++;
  emit("issue", undefined);
}
function failed() {
  failure.value =
    "Playback is unavailable. The URL may have expired, the format may be unsupported, or the provider may block access. Retry or open the original.";
  emit("issue", {
    code: "playback",
    title: "Media unavailable",
    message: failure.value,
  });
}
</script>
<template>
  <section class="embed-block" aria-label="Embedded content">
    <p v-if="source.kind === 'invalid'" role="alert">{{ source.error }}</p>
    <template v-else>
      <p class="tiny muted">
        {{ source.provider }} ·
        {{ source.kind === "iframe" ? "External embed" : source.kind }}
      </p>
      <button v-if="!active" class="button primary" @click="play">
        {{ source.kind === "iframe" ? "Load embed" : "Load player" }}
      </button>
      <template v-else>
        <video
          v-if="source.kind === 'video'"
          :key="attempt"
          :src="source.src"
          controls
          playsinline
          preload="metadata"
          @error="failed"
          aria-label="Video player"
        />
        <audio
          v-else-if="source.kind === 'audio'"
          :key="attempt"
          :src="source.src"
          controls
          preload="metadata"
          @error="failed"
          aria-label="Audio player"
        />
        <iframe
          v-else
          :key="attempt"
          :src="source.src"
          :title="String(row.title ?? source.provider)"
          :sandbox="
            source.trusted
              ? 'allow-scripts allow-same-origin allow-presentation'
              : 'allow-scripts allow-presentation'
          "
          allow="fullscreen; picture-in-picture; encrypted-media"
          referrerpolicy="no-referrer"
          @error="failed"
        />
      </template>
      <p v-if="failure" role="alert">{{ failure }}</p>
      <button v-if="failure" class="button" @click="play">Retry player</button>
      <p v-if="source.kind === 'iframe'" class="tiny muted">
        The provider controls embedding and playback. A blank or blocked frame
        does not confirm availability. Use the original link if it does not
        load.
      </p>
      <a :href="source.url" target="_blank" rel="noopener noreferrer"
        >Open original ↗</a
      >
    </template>
  </section>
</template>
<style scoped>
.embed-block {
  display: grid;
  gap: 12px;
  min-width: 0;
}
iframe,
video {
  border: 0;
  width: 100%;
  aspect-ratio: 16/9;
  min-height: 200px;
  border-radius: 8px;
  background: #f2f4ee;
}
audio {
  width: 100%;
}
button {
  justify-self: start;
}
a,
p {
  overflow-wrap: anywhere;
}
</style>
