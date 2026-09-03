<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import type { SiteRoute } from "./navigation";
import "./site.css";
import { useEditor } from "../stores/editor";
import { useWorkspace } from "../stores/workspace";
const editor = useEditor();
const store = useWorkspace();
defineProps<{ route: SiteRoute }>();
const WebMcpPage = defineAsyncComponent(() => import("./WebMcpPage.vue"));
const HackathonPage = defineAsyncComponent(() => import("./HackathonPage.vue"));
</script>
<template>
  <div class="documentation">
    <a class="skip-link" href="#documentation-main">Skip to content</a>
    <header class="doc-header">
      <a class="brand" href="/" data-site-link
        ><img src="/favicon.svg" width="32" height="32" alt="" />API Canvas</a
      >
      <nav aria-label="Main navigation">
        <a href="/" data-site-link>Canvas</a
        ><a
          href="/webmcp"
          data-site-link
          :aria-current="route === '/webmcp' ? 'page' : undefined"
          >WebMCP</a
        ><a
          href="/hackathon"
          data-site-link
          :aria-current="route === '/hackathon' ? 'page' : undefined"
          >Hackathon</a
        >
      </nav>
    </header>
    <main id="documentation-main" tabindex="-1" class="doc-main">
      <p
        v-if="
          editor.pendingDelete ||
          editor.pendingDashboard ||
          store.apiProposal ||
          editor.shareOpen
        "
        class="notice"
        role="status"
      >
        An agent action is waiting in the canvas.
        <a href="/" data-site-link>Open the canvas to review it</a>.
      </p>
      <WebMcpPage v-if="route === '/webmcp'" /><HackathonPage v-else />
    </main>
    <footer class="doc-footer">
      <a href="/" data-site-link>Back to the canvas</a>
      <p>API Canvas · Local data, shared control.</p>
      <a href="/webmcp" data-site-link>Tool documentation</a>
    </footer>
  </div>
</template>
