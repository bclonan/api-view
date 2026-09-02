import { defineStore } from "pinia";
import { ref } from "vue";
import { getOperation } from "../api/registry";
import { invoke, validateArguments, normalizeError } from "../runtime/invoke";
import { isRow } from "../runtime/normalize";
import {
  presentations,
  type Widget,
  type WidgetInput,
  type Row,
  type PresentationSpec,
  type DataMode,
} from "../types";
const storageKey = "api-canvas.workspace.v1";
const widths = [3, 4, 6, 8, 12];
export const useWorkspace = defineStore("workspace", () => {
  const id = ref(crypto.randomUUID());
  const title = ref("Untitled workspace");
  const widgets = ref<Widget[]>([]);
  const mode = ref<DataMode>("sample");
  const revision = ref(0);
  const notice = ref("");
  const createdAt = ref(new Date().toISOString());
  const updatedAt = ref(createdAt.value);
  const requests = new Map<string, AbortController>();
  function exportWorkspace() {
    return {
      version: 1,
      id: id.value,
      title: title.value,
      layout: { columns: 12 },
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      mode: mode.value,
      widgets: widgets.value.map((w) => ({
        apiId: w.invocation.apiId,
        operationId: w.invocation.operationId,
        arguments: w.invocation.arguments,
        mode: w.invocation.mode,
        title: w.title,
        presentation: w.presentation.type,
        mapping: w.presentation,
        width: w.width,
      })),
    };
  }
  function touch() {
    revision.value++;
    updatedAt.value = new Date().toISOString();
    try {
      localStorage.setItem(storageKey, JSON.stringify(exportWorkspace()));
    } catch {
      notice.value =
        "Local storage is unavailable. Export your workspace to keep a copy.";
    }
  }
  function checkRevision(expected?: number) {
    if (expected !== undefined && expected !== revision.value)
      throw new Error(
        `Workspace changed. Expected revision ${expected}, current revision ${revision.value}. Read the workspace and retry.`,
      );
  }
  function getWidget(widgetId: string) {
    const w = widgets.value.find((w) => w.id === widgetId);
    if (!w)
      throw new Error("Widget not found. Read the workspace for current IDs.");
    return w;
  }
  function validateInput(input: WidgetInput) {
    if (!isRow(input) || !isRow(input.arguments))
      throw new Error("Widget arguments must be an object.");
    getOperation(input.apiId, input.operationId);
    const valid = validateArguments(
      input.apiId,
      input.operationId,
      input.arguments,
    );
    if (input.presentation && !presentations.includes(input.presentation))
      throw new Error("Unknown presentation.");
    if (input.width !== undefined && !widths.includes(input.width))
      throw new Error("Width must be 3, 4, 6, 8, or 12.");
    if (input.mode && !["sample", "live"].includes(input.mode))
      throw new Error("Mode must be sample or live.");
    if (
      input.title !== undefined &&
      (typeof input.title !== "string" || input.title.length > 120)
    )
      throw new Error("Title must be at most 120 characters.");
    return valid;
  }
  function insertWidget(input: WidgetInput) {
    if (widgets.value.length >= 40)
      throw new Error("A workspace can contain up to 40 widgets.");
    const { args, missing } = validateInput(input);
    const { operation } = getOperation(input.apiId, input.operationId);
    const selected = input.presentation ?? "auto";
    const intended = selected === "auto" ? operation.preferred : selected;
    const w: Widget = {
      id: crypto.randomUUID(),
      title: input.title ?? operation.title,
      invocation: {
        apiId: input.apiId,
        operationId: input.operationId,
        arguments: args,
        mode: input.mode ?? mode.value,
      },
      presentation: { type: selected },
      width:
        input.width ??
        (intended === "metric"
          ? 3
          : intended === "table"
            ? 12
            : intended === "weather"
              ? 4
              : 6),
      status: missing.length ? "needs-input" : "draft",
      missingInputs: missing,
      createdAt: new Date().toISOString(),
    };
    widgets.value.push(w);
    touch();
    return w.id;
  }
  async function refreshWidget(widgetId: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const w = getWidget(widgetId);
    requests.get(widgetId)?.abort();
    const controller = new AbortController();
    requests.set(widgetId, controller);
    const combined = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    try {
      const { missing } = validateArguments(
        w.invocation.apiId,
        w.invocation.operationId,
        w.invocation.arguments,
      );
      w.missingInputs = missing;
      if (missing.length) {
        w.status = "needs-input";
        touch();
        return summary(w);
      }
      w.status = w.result ? "refreshing" : "loading";
      w.error = undefined;
      const result = await invoke(
        w.invocation.apiId,
        w.invocation.operationId,
        w.invocation.arguments,
        w.invocation.mode,
        combined,
      );
      if (
        requests.get(widgetId) !== controller ||
        !widgets.value.some((item) => item.id === widgetId)
      )
        return;
      Object.assign(w, result, {
        status: "ready",
        refreshedAt: new Date().toISOString(),
      });
      touch();
    } catch (error) {
      if (
        requests.get(widgetId) === controller &&
        widgets.value.some((item) => item.id === widgetId)
      ) {
        w.status = "error";
        w.error = normalizeError(error);
        touch();
      }
    } finally {
      if (requests.get(widgetId) === controller) requests.delete(widgetId);
    }
    return summary(w);
  }
  async function createWidget(input: WidgetInput, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const widgetId = insertWidget(input);
    await refreshWidget(widgetId, signal);
    return summary(getWidget(widgetId));
  }
  async function createDashboard(
    input: { title?: string; widgets: WidgetInput[] },
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    if (
      !Array.isArray(input.widgets) ||
      !input.widgets.length ||
      input.widgets.length > 12 ||
      widgets.value.length + input.widgets.length > 40
    )
      throw new Error("Add 1 to 12 widgets at a time, up to 40 total.");
    input.widgets.forEach(validateInput);
    if (
      input.title !== undefined &&
      (typeof input.title !== "string" || input.title.length > 120)
    )
      throw new Error("Title must be at most 120 characters.");
    if (input.title) title.value = input.title;
    const ids = input.widgets.map(insertWidget);
    await Promise.all(ids.map((widgetId) => refreshWidget(widgetId, signal)));
    return getWorkspace();
  }
  function validatePresentation(p: PresentationSpec, w: Widget) {
    if (
      !isRow(p) ||
      Object.keys(p).some(
        (key) => !["type", "xField", "yField", "fields"].includes(key),
      )
    )
      throw new Error("Invalid presentation mapping.");
    if (!presentations.includes(p.type))
      throw new Error("Unknown presentation.");
    if (
      [p.xField, p.yField].some(
        (key) =>
          key !== undefined && (typeof key !== "string" || key.length > 120),
      )
    )
      throw new Error("Field names must be text, up to 120 characters.");
    if (
      p.fields !== undefined &&
      (!Array.isArray(p.fields) ||
        p.fields.length > 30 ||
        p.fields.some((key) => typeof key !== "string" || key.length > 120))
    )
      throw new Error("Fields must be an array of up to 30 field names.");
    for (const key of [p.xField, p.yField, ...(p.fields ?? [])].filter(Boolean))
      if (w.result && !w.result.fields.some((f) => f.key === key))
        throw new Error(`Field ${key} is not in this result.`);
  }
  async function updateWidget(
    widgetId: string,
    patch: {
      title?: string;
      arguments?: Row;
      presentation?: Partial<PresentationSpec>;
      width?: number;
      mode?: DataMode;
    },
    reinvoke = true,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const w = getWidget(widgetId);
    const args = patch.arguments
      ? { ...w.invocation.arguments, ...patch.arguments }
      : w.invocation.arguments;
    const { missing } = validateInput({
      ...w.invocation,
      arguments: args,
      title: patch.title ?? w.title,
      presentation: patch.presentation?.type ?? w.presentation.type,
      width: patch.width ?? w.width,
      mode: patch.mode ?? w.invocation.mode,
    });
    const presentation = { ...w.presentation, ...patch.presentation };
    validatePresentation(presentation, w);
    const changed =
      JSON.stringify(args) !== JSON.stringify(w.invocation.arguments) ||
      (patch.mode !== undefined && patch.mode !== w.invocation.mode);
    if (changed) {
      requests.get(widgetId)?.abort();
      requests.delete(widgetId);
      w.rawResponse = undefined;
      w.result = undefined;
      w.requestUrl = undefined;
      w.refreshedAt = undefined;
      w.error = undefined;
      w.status = missing.length ? "needs-input" : "draft";
    }
    w.invocation.arguments = args;
    w.missingInputs = missing;
    if (patch.mode) w.invocation.mode = patch.mode;
    if (patch.title !== undefined) w.title = patch.title;
    if (patch.width !== undefined) w.width = patch.width;
    w.presentation = presentation;
    touch();
    if (changed && reinvoke) await refreshWidget(widgetId, signal);
    return summary(w);
  }
  async function transformWidget(
    widgetId: string,
    presentation: PresentationSpec,
    width?: number,
  ) {
    return updateWidget(widgetId, { presentation, width }, false);
  }
  async function refreshWidgets(ids?: string[], signal?: AbortSignal) {
    const selected = ids ?? widgets.value.map((w) => w.id);
    selected.forEach(getWidget);
    await Promise.all(
      [...new Set(selected)].map((widgetId) => refreshWidget(widgetId, signal)),
    );
    return getWorkspace();
  }
  function removeWidget(widgetId: string) {
    getWidget(widgetId);
    requests.get(widgetId)?.abort();
    requests.delete(widgetId);
    widgets.value = widgets.value.filter((w) => w.id !== widgetId);
    touch();
    return { removed: widgetId, revision: revision.value };
  }
  function summary(w: Widget) {
    return {
      id: w.id,
      title: w.title,
      ...w.invocation,
      presentation: w.presentation,
      width: w.width,
      status: w.status,
      missingInputs: w.missingInputs,
      fields: w.result?.fields,
      shape: w.result?.shape,
      lastUpdated: w.refreshedAt,
      error: w.error,
    };
  }
  function getWorkspace() {
    return {
      id: id.value,
      title: title.value,
      revision: revision.value,
      mode: mode.value,
      widgets: widgets.value.map(summary),
    };
  }
  function rename(value: string) {
    title.value = value.slice(0, 120) || "Untitled workspace";
    touch();
  }
  function setMode(value: DataMode) {
    mode.value = value;
    touch();
  }
  async function importWorkspace(value: unknown) {
    if (
      !isRow(value) ||
      value.version !== 1 ||
      !Array.isArray(value.widgets) ||
      value.widgets.length > 40 ||
      typeof value.title !== "string" ||
      value.title.length > 120
    )
      throw new Error("Choose a valid API Canvas workspace export, version 1.");
    value.widgets.forEach(
      (input: WidgetInput & { mapping?: PresentationSpec }) => {
        validateInput(input);
        if (input.mapping) validatePresentation(input.mapping, {} as Widget);
      },
    );
    requests.forEach((c) => c.abort());
    requests.clear();
    widgets.value = [];
    title.value = value.title;
    id.value = crypto.randomUUID();
    if (value.mode === "sample" || value.mode === "live")
      mode.value = value.mode;
    for (const input of value.widgets) {
      const newId = insertWidget(input);
      if (input.mapping) getWidget(newId).presentation = input.mapping;
    }
    touch();
    await refreshWidgets();
  }
  async function restore() {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) await importWorkspace(JSON.parse(stored));
    } catch {
      notice.value =
        "The saved workspace could not be restored. You can start a new one or import an export.";
    }
  }
  return {
    id,
    title,
    widgets,
    mode,
    revision,
    notice,
    createWidget,
    createDashboard,
    refreshWidget,
    refreshWidgets,
    updateWidget,
    transformWidget,
    removeWidget,
    getWorkspace,
    exportWorkspace,
    importWorkspace,
    restore,
    rename,
    setMode,
    checkRevision,
    getWidget,
  };
});
