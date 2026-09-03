<script setup lang="ts">
import { computed } from "vue";
import { youtubeEmbed } from "./navigation";
const props = defineProps<{ url: string }>();
const embed = computed(() => youtubeEmbed(props.url));
</script>
<template>
  <div class="video-frame">
    <iframe
      v-if="embed"
      :src="embed"
      title="API Canvas narrated demo"
      loading="lazy"
      allow="fullscreen; picture-in-picture"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
    <div v-else class="video-placeholder">
      <span class="doc-eyebrow">Recording planned · 2:50</span>
      <h3>A canvas we can both work on</h3>
      <p>
        The public YouTube demo will appear here. Recording and upload are still
        required.
      </p>
      <code>[YOUTUBE_URL]</code>
    </div>
  </div>
</template>
