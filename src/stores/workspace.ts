import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  getOperation,
  customApis,
  registerCustomApi,
  restoreCustomApis,
} from "../api/registry";
import { compileCustomApi } from "../api/custom";
import {
  invoke,
  validateArguments,
  validateOperationArguments,
  normalizeError,
  invokeOperation,
} from "../runtime/invoke";
import { boundResult, validateDataSettings } from "../runtime/bindings";
import { discoverFields, readPath } from "../runtime/fields";
import {
  readLocal,
  readLocalEntries,
  writeLocal,
  pruneLocal,
} from "../runtime/persistence";
import { getCapability, exampleArguments } from "../api/capabilities";
import { compatibleComponents } from "../blocks/definitions";
import { isRow, rowsOf } from "../runtime/normalize";
import {
  presentations,
  type Widget,
  type WidgetInput,
  type Row,
  type PresentationSpec,
  type DataMode,
  type DataBinding,
  type DataTransform,
  type ApiDefinition,
} from "../types";
const storageKey = "api-canvas.workspace.v1";
const libraryKey = "api-canvas.dashboards.v2";
const widths = [3, 4, 6, 8, 12];
export const useWorkspace = defineStore("workspace", () => {
  const id = ref(crypto.randomUUID());
  const title = ref("Untitled workspace");
  const widgets = ref<Widget[]>([]);
  const mode = ref<DataMode>("sample");
  const revision = ref(0);
  const notice = ref("");
  const savedOnDevice = ref(true);
  const createdAt = ref(new Date().toISOString());
  const updatedAt = ref(createdAt.value);
  const requests = new Map<string, AbortController>();
  const dataRequests = ref<
    {
      requestId: string;
      dashboardId: string;
      invocation: Widget["invocation"];
      response: Awaited<ReturnType<typeof invoke>>;
      savedAt: number;
    }[]
  >([]);
  const health = ref<Record<string, Row>>({});
  const apiProposal = ref<ReturnType<typeof compileCustomApi>["config"]>();
  function proposeApi(value: unknown) {
    const compiled = compileCustomApi(value);
    if (compiled.config.method !== "GET")
      throw new Error(
        "Proposed public APIs must use GET. Configure other methods manually.",
      );
    if (
      Object.keys(compiled.config.headers ?? {}).some(
        (h) => !["accept", "content-type"].includes(h.toLowerCase()),
      )
    )
      throw new Error("Proposals only allow Accept and Content-Type headers.");
    apiProposal.value = compiled.config;
    return {
      status: "awaiting-review",
      definition: compiled.config,
      message:
        "Review the proposed API and use the visible Save API button to add it.",
    };
  }
  const selectedIds = ref<string[]>([]);
  function selectCards(ids: string[]) {
    ids.forEach(getWidget);
    selectedIds.value = [...new Set(ids)];
    return getWorkspace();
  }
  function resolveCard(widgetId?: string) {
    const value =
      widgetId ??
      (selectedIds.value.length === 1 ? selectedIds.value[0] : undefined);
    if (!value) throw new Error("Select one card or provide its ID.");
    return getWidget(value);
  }
  async function runApi(
    sourceId: string,
    capabilityId: string,
    params: Row,
    dataMode: DataMode = mode.value,
    signal?: AbortSignal,
  ) {
    const { api, operation } = getCapability(sourceId, capabilityId),
      dashboardId = id.value;
    const response = await invoke(
      api.id,
      operation.id,
      params,
      dataMode,
      signal,
    );
    signal?.throwIfAborted();
    if (dashboardId !== id.value)
      throw new Error("Dashboard changed while the request was running.");
    const entry = {
      requestId: crypto.randomUUID(),
      dashboardId,
      invocation: {
        apiId: api.id,
        operationId: operation.id,
        arguments: params,
        mode: dataMode,
      },
      response,
      savedAt: Date.now(),
    };
    dataRequests.value.unshift(entry);
    dataRequests.value = dataRequests.value.slice(0, 40);
    await writeLocal(`request:${response.result.id}`, entry);
    await pruneLocal("request:", 40);
    return {
      requestId: entry.requestId,
      envelopeId: response.result.id,
      status: rowsOf(response.result.data).length ? "ready" : "empty",
      recordCount: rowsOf(response.result.data).length,
      fields: response.result.fields,
      shape: response.result.shape,
      requestUrl: response.requestUrl,
      suggestions: rowsOf(response.result.data).length
        ? []
        : ["Broaden the query, date range or geographic area."],
    };
  }
  async function getEnvelope(envelopeId: string) {
    const widget = widgets.value.find((w) => w.result?.id === envelopeId);
    if (widget?.result)
      return {
        invocation: widget.invocation,
        response: {
          result: widget.result,
          rawResponse: widget.rawResponse,
          requestUrl: widget.requestUrl ?? "",
          durationMs: widget.durationMs ?? 0,
        },
      };
    const entry =
      dataRequests.value.find((e) => e.response.result.id === envelopeId) ??
      (await readLocal<(typeof dataRequests.value)[number]>(
        `request:${envelopeId}`,
      ));
    if (!entry || entry.dashboardId !== id.value)
      throw new Error(
        "Data not available in this dashboard. Run the request again.",
      );
    return entry;
  }
  async function inspectData(
    envelopeId: string,
    origin: "data" | "raw" = "data",
    path = "$",
    limit = 5,
  ) {
    const entry = await getEnvelope(envelopeId),
      result = entry.response.result;
    const value = readPath(
      origin === "raw" ? entry.response.rawResponse : result.data,
      path,
    );
    const sample = Array.isArray(value)
      ? value.slice(0, Math.min(20, limit))
      : value;
    const text = JSON.stringify(sample);
    return {
      envelopeId,
      source: result.source,
      structure: result.structure,
      fields: result.fields,
      origin,
      path,
      sample: text?.length > 25000 ? text.slice(0, 25000) : sample,
      truncated: (text?.length ?? 0) > 25000,
      recordCount: rowsOf(result.data).length,
    };
  }
  async function addCard(
    envelopeId: string,
    options: {
      title?: string;
      presentation?: PresentationSpec;
      width?: number;
      bindings?: Record<string, DataBinding>;
      transforms?: DataTransform[];
    } = {},
  ) {
    const dashboardId = id.value;
    const entry = await getEnvelope(envelopeId);
    if (dashboardId !== id.value)
      throw new Error("Dashboard changed before the card could be added.");
    const input = {
      ...entry.invocation,
      title: options.title,
      presentation: options.presentation?.type,
      width: options.width,
      bindings: options.bindings,
      transforms: options.transforms,
    };
    validateInput(input);
    if (options.presentation)
      validatePresentation(options.presentation, {} as Widget);
    const cardId = insertWidget(input),
      widget = getWidget(cardId);
    Object.assign(widget, entry.response, {
      status: "ready",
      refreshedAt: entry.response.result.source.invokedAt,
    });
    if (options.presentation) widget.presentation = options.presentation;
    touch();
    return summary(widget);
  }
  async function duplicateCard(
    widgetId: string,
    presentation?: PresentationSpec,
  ) {
    const original = getWidget(widgetId);
    if (!original.result)
      throw new Error("Load data before duplicating a card.");
    return addCard(original.result.id, {
      title: `${original.title} copy`.slice(0, 120),
      presentation:
        presentation ?? JSON.parse(JSON.stringify(original.presentation)),
      width: original.width,
      bindings: original.bindings,
      transforms: original.transforms,
    });
  }
  async function testSource(
    sourceId: string,
    capabilityId: string,
    params?: Row,
    signal?: AbortSignal,
  ) {
    const { api, operation } = getCapability(sourceId, capabilityId);
    if ((operation.method ?? "GET") !== "GET")
      throw new Error("Source health tests only send GET requests.");
    const inputs = { ...(params ?? exampleArguments(sourceId, capabilityId)) };
    if (!params)
      for (const key of ["limit", "rows", "pageSize", "per_page", "c"])
        if (operation.inputs[key])
          inputs[key] = Math.max(operation.inputs[key].minimum ?? 1, 2);
    let result: Row;
    try {
      const response = await invoke(
        api.id,
        operation.id,
        inputs,
        "live",
        signal,
        true,
      );
      const transport = isRow(response.result.metadata.transport)
        ? response.result.metadata.transport
        : {};
      result = {
        ...transport,
        status: "ok",
        httpStatus: transport.status,
        cors: "accessible from this browser",
        latencyMs: response.durationMs,
        shape: response.result.shape,
        recordCount: rowsOf(response.result.data).length,
        requestUrl: response.requestUrl,
      };
    } catch (error) {
      result = {
        status: "failed",
        cors: "not established",
        error: normalizeError(error),
      };
    }
    const key = `${sourceId}/${operation.id}`;
    health.value[key] = { ...result, lastTestedAt: new Date().toISOString() };
    await writeLocal("source-health", health.value);
    return health.value[key];
  }
  let loadingWorkspace = false;
  const savedDashboards = ref<ReturnType<typeof exportWorkspace>[]>([]);
  const cleared = ref<ReturnType<typeof exportWorkspace>>();
  const dashboards = computed(() =>
    savedDashboards.value.map((d) => ({
      id: d.id,
      title: d.id === id.value ? title.value : d.title,
      widgetCount: d.id === id.value ? widgets.value.length : d.widgets.length,
      updatedAt: d.updatedAt,
    })),
  );
  function exportWorkspace() {
    return {
      version: 1,
      id: id.value,
      title: title.value,
      layout: { columns: 12 },
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      mode: mode.value,
      customApis: customApis.filter((api) =>
        widgets.value.some((w) => w.invocation.apiId === api.id),
      ),
      widgets: widgets.value.map((w) => ({
        id: w.id,
        apiId: w.invocation.apiId,
        operationId: w.invocation.operationId,
        arguments: w.invocation.arguments,
        mode: w.invocation.mode,
        title: w.title,
        presentation: w.presentation.type,
        mapping: w.presentation,
        width: w.width,
        bindings: w.bindings,
        transforms: w.transforms,
      })),
    };
  }
  function touch() {
    revision.value++;
    updatedAt.value = new Date().toISOString();
    if (loadingWorkspace) return;
    try {
      saveCurrent();
    } catch {
      savedOnDevice.value = false;
      notice.value =
        "Local storage is unavailable. Export your workspace to keep a copy.";
    }
  }
  function saveCurrent() {
    const current = JSON.parse(JSON.stringify(exportWorkspace()));
    const index = savedDashboards.value.findIndex((d) => d.id === id.value);
    if (index < 0) savedDashboards.value.push(current);
    else savedDashboards.value[index] = current;
    localStorage.setItem(
      libraryKey,
      JSON.stringify({
        version: 2,
        activeId: id.value,
        dashboards: savedDashboards.value,
        customApis,
      }),
    );
    savedOnDevice.value = true;
  }
  function stopRequests() {
    requests.forEach((controller) => controller.abort());
    requests.clear();
  }
  async function newDashboard(name = "Untitled dashboard") {
    if (savedDashboards.value.length >= 30)
      throw new Error("Keep up to 30 dashboards on this device.");
    saveCurrent();
    stopRequests();
    id.value = crypto.randomUUID();
    title.value = name.trim().slice(0, 120) || "Untitled dashboard";
    widgets.value = [];
    createdAt.value = new Date().toISOString();
    cleared.value = undefined;
    touch();
    return getWorkspace();
  }
  async function switchDashboard(dashboardId: string) {
    if (dashboardId === id.value) return getWorkspace();
    const target = savedDashboards.value.find((d) => d.id === dashboardId);
    if (!target) throw new Error("Dashboard not found on this device.");
    saveCurrent();
    await loadWorkspace(target, true);
    return getWorkspace();
  }
  async function duplicateDashboard(name?: string) {
    const snapshot = exportWorkspace();
    await newDashboard(name ?? `${title.value} copy`);
    await loadWorkspace(
      { ...snapshot, id: id.value, title: title.value },
      true,
    );
    return getWorkspace();
  }
  function clearDashboard() {
    if (!widgets.value.length) return getWorkspace();
    cleared.value = JSON.parse(JSON.stringify(exportWorkspace()));
    stopRequests();
    widgets.value = [];
    touch();
    return getWorkspace();
  }
  async function undoClear() {
    if (!cleared.value || cleared.value.id !== id.value)
      throw new Error("There is no cleared dashboard to restore.");
    if (widgets.value.length)
      throw new Error("Restore is available while the dashboard is empty.");
    const snapshot = cleared.value;
    cleared.value = undefined;
    await loadWorkspace(snapshot, true);
  }
  async function deleteDashboard(dashboardId: string) {
    if (!savedDashboards.value.some((d) => d.id === dashboardId))
      throw new Error("Dashboard not found.");
    if (dashboardId === id.value) {
      const replacement = savedDashboards.value.find(
        (d) => d.id !== dashboardId,
      );
      if (replacement) await switchDashboard(replacement.id);
      else await newDashboard();
    }
    savedDashboards.value = savedDashboards.value.filter(
      (d) => d.id !== dashboardId,
    );
    touch();
    return getWorkspace();
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
  function validateInput(
    input: WidgetInput,
    definitions: ApiDefinition[] = [],
  ) {
    if (!isRow(input) || !isRow(input.arguments))
      throw new Error("Widget arguments must be an object.");
    const custom = definitions
      .find((a) => a.id === input.apiId)
      ?.operations.find((o) => o.id === input.operationId);
    const valid = custom
      ? validateOperationArguments(custom, input.arguments)
      : validateArguments(input.apiId, input.operationId, input.arguments);
    validateDataSettings(input.bindings, input.transforms);
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
      bindings: input.bindings
        ? JSON.parse(JSON.stringify(input.bindings))
        : undefined,
      transforms: input.transforms
        ? JSON.parse(JSON.stringify(input.transforms))
        : undefined,
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
  function recordFailedRequest(input: WidgetInput, error: unknown) {
    const cardId = insertWidget(input);
    const widget = getWidget(cardId);
    if (!widget.missingInputs?.length) widget.status = "error";
    widget.error = normalizeError(error);
    touch();
    return summary(widget);
  }
  async function refreshWidget(
    widgetId: string,
    signal?: AbortSignal,
    fresh = true,
  ) {
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
        fresh,
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
    input.widgets.forEach((w) => validateInput(w));
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
        (key) =>
          !["type", "xField", "yField", "fields", "props", "series"].includes(
            key,
          ),
      )
    )
      throw new Error("Invalid presentation mapping.");
    if (!presentations.includes(p.type))
      throw new Error("Unknown presentation.");
    if (
      p.props &&
      (!isRow(p.props) ||
        Object.keys(p.props).some(
          (key) => !["compact", "numberFormat", "showSource"].includes(key),
        ) ||
        (p.props.compact !== undefined &&
          typeof p.props.compact !== "boolean") ||
        (p.props.showSource !== undefined &&
          typeof p.props.showSource !== "boolean") ||
        (p.props.numberFormat !== undefined &&
          !["compact", "standard"].includes(p.props.numberFormat)))
    )
      throw new Error("Invalid presentation properties.");
    if (
      [p.xField, p.yField].some(
        (key) =>
          key !== undefined && (typeof key !== "string" || key.length > 500),
      )
    )
      throw new Error("Field names must be text, up to 120 characters.");
    if (
      p.fields !== undefined &&
      (!Array.isArray(p.fields) ||
        p.fields.length > 30 ||
        p.fields.some((key) => typeof key !== "string" || key.length > 500))
    )
      throw new Error("Fields must be an array of up to 30 field names.");
    if (
      p.series &&
      (!Array.isArray(p.series) ||
        p.series.length > 4 ||
        p.series.some((key) => typeof key !== "string" || key.length > 500))
    )
      throw new Error("Choose up to four series fields.");
    for (const key of [
      p.xField,
      p.yField,
      ...(p.fields ?? []),
      ...(p.series ?? []),
    ].filter(Boolean))
      if (
        w.result &&
        !boundResult(w, widgets.value).result?.fields.some((f) => f.key === key)
      )
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
      bindings?: Record<string, DataBinding>;
      transforms?: DataTransform[];
      position?: number;
    },
    reinvoke = true,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const w = getWidget(widgetId);
    if (
      patch.position !== undefined &&
      (!Number.isInteger(patch.position) ||
        patch.position < 0 ||
        patch.position >= widgets.value.length)
    )
      throw new Error("Position must be a valid zero-based widget position.");
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
    validateDataSettings(
      patch.bindings ?? w.bindings,
      patch.transforms ?? w.transforms,
    );
    if ((patch.bindings || patch.transforms) && !patch.presentation) {
      const available =
        boundResult(
          {
            ...w,
            bindings: patch.bindings ?? w.bindings,
            transforms: patch.transforms ?? w.transforms,
          },
          widgets.value,
        ).result?.fields.map((f) => f.key) ?? [];
      if (presentation.xField && !available.includes(presentation.xField))
        delete presentation.xField;
      if (presentation.yField && !available.includes(presentation.yField))
        delete presentation.yField;
      if (presentation.fields)
        presentation.fields = presentation.fields.filter((f) =>
          available.includes(f),
        );
    }
    validatePresentation(presentation, {
      ...w,
      bindings: patch.bindings ?? w.bindings,
      transforms: patch.transforms ?? w.transforms,
    });
    for (const binding of Object.values(patch.bindings ?? {}))
      if (
        binding.sourceId &&
        !widgets.value.some((source) => source.id === binding.sourceId)
      )
        throw new Error("Binding source not found. Read the workspace first.");
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
    if (patch.bindings !== undefined)
      w.bindings = JSON.parse(JSON.stringify(patch.bindings));
    if (patch.transforms !== undefined)
      w.transforms = JSON.parse(JSON.stringify(patch.transforms));
    if (patch.position !== undefined) {
      widgets.value = widgets.value.filter((item) => item.id !== widgetId);
      widgets.value.splice(patch.position, 0, w);
    }
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
  async function refreshWidgets(
    ids?: string[],
    signal?: AbortSignal,
    fresh = true,
  ) {
    const selected = ids ?? widgets.value.map((w) => w.id);
    selected.forEach(getWidget);
    await Promise.all(
      [...new Set(selected)].map((widgetId) =>
        refreshWidget(widgetId, signal, fresh),
      ),
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
    const display = boundResult(w, widgets.value);
    return {
      id: w.id,
      title: w.title,
      ...w.invocation,
      presentation: w.presentation,
      bindings: w.bindings,
      transforms: w.transforms,
      width: w.width,
      status: w.status,
      envelopeId: w.result?.id,
      missingInputs: w.missingInputs,
      fields: w.result?.fields,
      displayFields: display.result?.fields,
      bindingIssues: display.issues,
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
      dashboards: dashboards.value,
      selectedIds: selectedIds.value.filter((key) =>
        widgets.value.some((w) => w.id === key),
      ),
      requests: dataRequests.value
        .filter((e) => e.dashboardId === id.value)
        .map((e) => ({
          requestId: e.requestId,
          envelopeId: e.response.result.id,
          invocation: e.invocation,
          recordCount: rowsOf(e.response.result.data).length,
        })),
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
  function inspectWidget(widgetId: string) {
    const widget = getWidget(widgetId);
    const display = boundResult(widget, widgets.value);
    return {
      ...summary(widget),
      rawFields: discoverFields(widget.rawResponse, false),
      dataFields: widget.result?.fieldTree,
      provenance: display.provenance,
      components: compatibleComponents(display.result).map(
        ({ id, compatible, score, reason, bindings }) => ({
          id,
          compatible,
          score,
          reason,
          bindings,
        }),
      ),
    };
  }
  function resultForWidget(widgetId: string) {
    return boundResult(getWidget(widgetId), widgets.value);
  }
  function moveWidget(widgetId: string, position: number) {
    const widget = getWidget(widgetId);
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position >= widgets.value.length
    )
      throw new Error("Position must be a valid zero-based widget position.");
    widgets.value = widgets.value.filter((w) => w.id !== widgetId);
    widgets.value.splice(position, 0, widget);
    touch();
    return getWorkspace();
  }
  function defineCustomApi(value: unknown) {
    const compiled = compileCustomApi(value);
    for (const dashboard of savedDashboards.value)
      for (const widget of dashboard.widgets.filter(
        (w) => w.apiId === compiled.api.id,
      ))
        validateOperationArguments(
          compiled.api.operations[0],
          widget.arguments,
        );
    const api = registerCustomApi(value);
    for (const widget of widgets.value.filter(
      (w) => w.invocation.apiId === api.id,
    )) {
      requests.get(widget.id)?.abort();
      requests.delete(widget.id);
      widget.result = undefined;
      widget.rawResponse = undefined;
      widget.status = "draft";
      widget.error = undefined;
    }
    touch();
    return { apiId: api.id, operationId: api.operations[0].id };
  }
  async function testCustomApi(value: unknown, args: Row, dataMode: DataMode) {
    const { api } = compileCustomApi(value);
    return invokeOperation(api, api.operations[0], args, dataMode);
  }
  function validateWorkspace(
    value: unknown,
  ): asserts value is ReturnType<typeof exportWorkspace> {
    if (
      !isRow(value) ||
      value.version !== 1 ||
      !Array.isArray(value.widgets) ||
      value.widgets.length > 40 ||
      typeof value.title !== "string" ||
      value.title.length > 120
    )
      throw new Error("Choose a valid API Canvas workspace export, version 1.");
    if (
      value.customApis !== undefined &&
      (!Array.isArray(value.customApis) || value.customApis.length > 30)
    )
      throw new Error("Invalid custom API definitions.");
    const definitions = (value.customApis ?? []).map((d: unknown) =>
      compileCustomApi(d),
    );
    for (const { config } of definitions) {
      const existing = customApis.find((a) => a.id === config.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(config))
        throw new Error(
          `Custom API ${config.id} already exists with different settings. Give the imported API a different ID.`,
        );
    }
    value.widgets.forEach(
      (input: WidgetInput & { mapping?: PresentationSpec }) => {
        validateInput(
          input,
          definitions.map((d: { api: ApiDefinition }) => d.api),
        );
        if (input.mapping) validatePresentation(input.mapping, {} as Widget);
      },
    );
    const ids = value.widgets.map((w: any) => w.id).filter(Boolean);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((key: unknown) => typeof key !== "string" || key.length > 120)
    )
      throw new Error("Widget IDs must be unique text values.");
  }
  async function loadWorkspace(value: unknown, preserveId = false) {
    validateWorkspace(value);
    const snapshot = JSON.parse(JSON.stringify(value)) as ReturnType<
      typeof exportWorkspace
    >;
    for (const definition of snapshot.customApis ?? [])
      registerCustomApi(definition);
    loadingWorkspace = true;
    stopRequests();
    widgets.value = [];
    title.value = snapshot.title;
    if (preserveId)
      id.value =
        typeof snapshot.id === "string" &&
        snapshot.id.length > 0 &&
        snapshot.id.length <= 120
          ? snapshot.id
          : crypto.randomUUID();
    createdAt.value = snapshot.createdAt ?? new Date().toISOString();
    if (snapshot.mode === "sample" || snapshot.mode === "live")
      mode.value = snapshot.mode;
    for (const input of snapshot.widgets) {
      const newId = insertWidget(input);
      const widget = getWidget(newId);
      if (input.mapping) widget.presentation = input.mapping;
      if (input.id) widget.id = input.id;
    }
    cleared.value = undefined;
    loadingWorkspace = false;
    touch();
    // Restoring saved configuration must not repeat a POST, PUT, PATCH or DELETE.
    await refreshWidgets(
      widgets.value
        .filter(
          (widget) =>
            widget.invocation.mode === "sample" ||
            (getOperation(
              widget.invocation.apiId,
              widget.invocation.operationId,
            ).operation.method ?? "GET") === "GET",
        )
        .map((widget) => widget.id),
      undefined,
      false,
    );
  }
  async function importWorkspace(value: unknown) {
    validateWorkspace(value);
    await loadWorkspace(value);
  }
  async function restore() {
    dataRequests.value = (
      await readLocalEntries<(typeof dataRequests.value)[number]>("request:")
    )
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, 40);
    health.value =
      (await readLocal<Record<string, Row>>("source-health")) ?? {};
    try {
      const library = localStorage.getItem(libraryKey);
      if (library) {
        const parsed = JSON.parse(library);
        if (
          parsed.version !== 2 ||
          !Array.isArray(parsed.dashboards) ||
          !parsed.dashboards.length ||
          parsed.dashboards.length > 30
        )
          throw new Error("Invalid dashboard library.");
        restoreCustomApis(parsed.customApis ?? []);
        const dashboardIds = parsed.dashboards.map(
          (dashboard: { id?: unknown }) => dashboard.id,
        );
        if (
          dashboardIds.some(
            (key: unknown) =>
              typeof key !== "string" || !key || key.length > 120,
          ) ||
          new Set(dashboardIds).size !== dashboardIds.length
        )
          throw new Error("Dashboard IDs must be unique text values.");
        // Library-level definitions are current; old dashboard snapshots may predate an API edit.
        parsed.dashboards.forEach((d: any) => {
          d.customApis = (d.customApis ?? []).map(
            (a: any) => customApis.find((c) => c.id === a.id) ?? a,
          );
          validateWorkspace(d);
        });
        savedDashboards.value = parsed.dashboards;
        await loadWorkspace(
          parsed.dashboards.find(
            (d: { id: string }) => d.id === parsed.activeId,
          ) ?? parsed.dashboards[0],
          true,
        );
        return;
      }
      const stored = localStorage.getItem(storageKey);
      if (stored) await loadWorkspace(JSON.parse(stored), true);
      else touch();
    } catch {
      notice.value =
        "The saved workspace could not be restored. You can start a new one or import an export.";
    }
  }
  return {
    apiProposal,
    proposeApi,
    dataRequests,
    health,
    selectedIds,
    selectCards,
    resolveCard,
    runApi,
    recordFailedRequest,
    getEnvelope,
    inspectData,
    addCard,
    duplicateCard,
    testSource,
    id,
    title,
    widgets,
    mode,
    revision,
    notice,
    savedOnDevice,
    dashboards,
    cleared,
    newDashboard,
    switchDashboard,
    duplicateDashboard,
    deleteDashboard,
    clearDashboard,
    undoClear,
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
    inspectWidget,
    resultForWidget,
    moveWidget,
    defineCustomApi,
    testCustomApi,
  };
});
