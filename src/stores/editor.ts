import { defineStore } from "pinia";
import { ref, watch } from "vue";
export const useEditor = defineStore("editor", () => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("api-canvas.sidebar-collapsed");
  } catch {
    /* Device storage can be unavailable. */
  }
  const collapsed = ref(
    saved === null
      ? (typeof window === "undefined" ? 1024 : window.innerWidth) < 768
      : saved === "true",
  );
  watch(collapsed, (value) => {
    try {
      localStorage.setItem("api-canvas.sidebar-collapsed", String(value));
    } catch {
      /* The control remains usable in memory. */
    }
  });
  const contextOpen = ref(false),
    shareOpen = ref(false);
  const pendingDashboard = ref<{
    action: "clear" | "delete";
    dashboardId: string;
    revision: number;
  }>();
  const pendingDelete = ref<{ widgetId: string; revision: number }>();
  return { collapsed, contextOpen, shareOpen, pendingDelete, pendingDashboard };
});
