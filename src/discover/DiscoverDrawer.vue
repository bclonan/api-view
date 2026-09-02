<script setup lang="ts">
import { computed, ref } from "vue";
import { Search, Plus, X } from "lucide-vue-next";
import { apis, searchApis } from "../api/registry";
import ApiIcon from "../components/ApiIcon.vue";
defineProps<{ collapsed?: boolean }>();
const emit = defineEmits<{
  select: [apiId: string, operationId: string];
  close: [];
  custom: [];
}>();
const query = ref("");
const category = ref("");
const matches = computed(
  () =>
    new Set(searchApis(query.value, category.value, 200).map((m) => m.apiId)),
);
const categories = computed(() =>
  [...new Set(apis.flatMap((api) => api.categories))].sort(),
);
</script>
<template>
  <aside class="discover" v-if="!collapsed">
    <div class="discover-heading">
      <h2>Discover</h2>
      <button
        class="icon-button mobile-discover-close"
        aria-label="Close discovery"
        @click="emit('close')"
      >
        <X :size="16" /></button
      ><span>{{ apis.length }} sources</span>
    </div>
    <label class="search-box"
      ><Search :size="15" /><input
        aria-label="Search APIs"
        v-model="query"
        placeholder="Search APIs..."
      /><kbd>/</kbd></label
    >
    <div class="category-select">
      <select aria-label="Filter by category" v-model="category">
        <option value="">All categories</option>
        <option v-for="c in categories" :key="c">{{ c }}</option>
      </select>
    </div>
    <div class="sidebar-label">
      {{ query || category ? "SEARCH RESULTS" : "EXPLORE SOURCES" }}
    </div>
    <div class="api-list">
      <button
        v-for="api in apis.filter((a) => matches.has(a.id))"
        :key="api.id"
        class="api-card"
        @click="emit('select', api.id, api.operations[0].id)"
      >
        <span
          :class="[
            'api-icon',
            `color-${api.categories[0].toLowerCase().replace(' ', '-')}`,
          ]"
          ><ApiIcon :name="api.icon" /></span
        ><span
          ><strong>{{ api.name }}</strong
          ><small>{{
            api.liveNotice ? "Sample only" : api.categories[0]
          }}</small></span
        ><Plus :size="14" class="api-add" />
      </button>
      <p v-if="!matches.size" class="muted no-results">
        No sources match. Try weather, books, or debt.
      </p>
      <button class="button custom-api-button" @click="emit('custom')">
        <Plus :size="14" /> Add API or local data
      </button>
    </div>
    <div class="discover-note">
      <span class="status-dot ready"></span
      ><span
        >{{
          apis.filter((api) => api.authentication !== "api-key").length
        }}
        sources without API keys</span
      >
      <p>Public data. Yours to explore.</p>
    </div>
  </aside>
</template>
