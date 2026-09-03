<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { useWorkspace } from "../stores/workspace";
import WidgetShell from "../widgets/WidgetShell.vue";

const store = useWorkspace();
const grid = ref<HTMLElement>();
const draggedId = ref<string>();
const targetId = ref<string>();
const afterTarget = ref(false);
const announcement = ref("");
let pointer:
  | { id: number; blockId: string; x: number; y: number; element: HTMLElement }
  | undefined;
let lastPoint = { x: 0, y: 0 };
let scrollFrame = 0;
let suppressClick = false;

function cardAt(event: KeyboardEvent) {
  return (event.target as HTMLElement).closest<HTMLElement>("[data-widget-id]");
}
function stopDrag() {
  if (pointer?.element.hasPointerCapture(pointer.id))
    pointer.element.releasePointerCapture(pointer.id);
  pointer = undefined;
  cancelAnimationFrame(scrollFrame);
  draggedId.value = undefined;
  targetId.value = undefined;
}
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary || store.widgets.length < 2)
    return;
  const handle = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-reorder-handle]",
  );
  const id = handle?.closest<HTMLElement>("[data-widget-id]")?.dataset.widgetId;
  if (!handle || !id) return;
  suppressClick = false;
  pointer = {
    id: event.pointerId,
    blockId: id,
    x: event.clientX,
    y: event.clientY,
    element: handle,
  };
  handle.setPointerCapture(event.pointerId);
}
function updateTarget() {
  const card = document
    .elementFromPoint(lastPoint.x, lastPoint.y)
    ?.closest<HTMLElement>("[data-widget-id]");
  if (!card || !grid.value?.contains(card)) {
    targetId.value = undefined;
    return;
  }
  targetId.value = card?.dataset.widgetId;
  if (card) {
    const rect = card.getBoundingClientRect();
    const y = (lastPoint.y - rect.top) / rect.height;
    afterTarget.value =
      y > 0.75 || (y >= 0.25 && lastPoint.x > rect.left + rect.width / 2);
  }
}
function autoScroll() {
  if (!draggedId.value) return;
  const delta =
    lastPoint.y < 100 ? -12 : lastPoint.y > innerHeight - 110 ? 12 : 0;
  if (delta) {
    window.scrollBy(0, delta);
    updateTarget();
  }
  scrollFrame = requestAnimationFrame(autoScroll);
}
function dragOver(event: PointerEvent) {
  if (!pointer || event.pointerId !== pointer.id) return;
  lastPoint = { x: event.clientX, y: event.clientY };
  if (!draggedId.value) {
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6)
      return;
    draggedId.value = pointer.blockId;
    suppressClick = true;
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  event.preventDefault();
  updateTarget();
}
async function move(id: string, position: number, focusHandle = false) {
  const card = store.widgets.find((w) => w.id === id);
  if (!card) return;
  store.moveWidget(id, position);
  announcement.value = `${card.title} moved to position ${position + 1} of ${store.widgets.length}.`;
  if (focusHandle) {
    await nextTick();
    const element = Array.from(
      grid.value?.querySelectorAll<HTMLElement>("[data-widget-id]") ?? [],
    ).find((el) => el.dataset.widgetId === id);
    element?.querySelector<HTMLElement>("[data-reorder-handle]")?.focus();
  }
}
function drop(event: PointerEvent) {
  if (!pointer || event.pointerId !== pointer.id) return;
  if (!draggedId.value) {
    stopDrag();
    return;
  }
  event.preventDefault();
  dragOver(event);
  const from = store.widgets.findIndex((w) => w.id === draggedId.value);
  const to = store.widgets.findIndex((w) => w.id === targetId.value);
  if (from >= 0 && to >= 0 && from !== to) {
    const insertion = to + Number(afterTarget.value);
    void move(draggedId.value, insertion - Number(from < insertion), true);
  }
  stopDrag();
}
function cancel(event: KeyboardEvent) {
  if (event.key === "Escape" && pointer) {
    event.preventDefault();
    stopDrag();
  }
}
function click(event: MouseEvent) {
  if (suppressClick) {
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }
}
onBeforeUnmount(stopDrag);
function keyboardMove(event: KeyboardEvent) {
  if (!(event.target as HTMLElement).closest("[data-reorder-handle]")) return;
  const id = cardAt(event)?.dataset.widgetId;
  const index = store.widgets.findIndex((w) => w.id === id);
  if (!id || index < 0) return;
  const positions: Record<string, number> = {
    ArrowUp: index - 1,
    ArrowLeft: index - 1,
    ArrowDown: index + 1,
    ArrowRight: index + 1,
    Home: 0,
    End: store.widgets.length - 1,
  };
  if (!(event.key in positions)) return;
  event.preventDefault();
  const position = Math.max(
    0,
    Math.min(store.widgets.length - 1, positions[event.key]!),
  );
  if (position !== index) void move(id, position, true);
}
</script>
<template>
  <p class="layout-hint">
    Cards fill each row. Drag a card's handle or choose its position to reorder.
  </p>
  <p id="reorder-help" class="sr-only">
    Use arrow keys to move this card, Home for first, or End for last. Press
    Enter to choose a position.
  </p>
  <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  <div
    ref="grid"
    class="workspace-grid"
    @pointerdown="startDrag"
    @pointermove="dragOver"
    @pointerup="drop"
    @pointercancel="stopDrag"
    @lostpointercapture="stopDrag"
    @click.capture="click"
    @keydown.capture="cancel"
    @keydown="keyboardMove"
  >
    <WidgetShell
      v-for="widget in store.widgets"
      :key="widget.id"
      :widget="widget"
      :class="{
        'widget-dragging': draggedId === widget.id,
        'drop-before':
          draggedId !== widget.id && targetId === widget.id && !afterTarget,
        'drop-after':
          draggedId !== widget.id && targetId === widget.id && afterTarget,
      }"
    />
  </div>
</template>
