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
import {
  boundResult,
  validateDataSettings,
  validateGraph,
  dependencies,
} from "../runtime/bindings";
import { stableId } from "../sources/security";
import { blockOutcome } from "../runtime/outcomes";
import { validateBlockStyle } from "../runtime/blockStyle";
import {
  validateContent,
  contentEvidence,
  contentIssues,
  contentResult,
} from "../runtime/content";
import type { CanvasContent, ContentMeta } from "../types";
import type { TaggedField } from "../types";
import { discoverFields, readPath, pathParts } from "../runtime/fields";
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
  const fieldSelections = ref<TaggedField[]>([]);
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
    if (original.content) {
      const copy = createContent(
        { ...original.content, title: `${original.title} copy`.slice(0, 120) },
        original.contentMeta?.origin ?? "user",
        {
          key: crypto.randomUUID(),
          width: original.width,
          presentation: presentation ?? original.presentation,
        },
      );
      return copy;
    }
    if (original.derived)
      return createDerived({
        sourceIds: original.derived.sourceIds,
        title: `${original.title} copy`.slice(0, 120),
        bindings: original.bindings,
        transforms: original.transforms,
        presentation: presentation ?? original.presentation,
        width: original.width,
        key: crypto.randomUUID(),
      });
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
      fieldSelections: fieldSelections.value,
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
        derived: w.derived,
        bindings: w.bindings,
        transforms: w.transforms,
        content: w.content,
        contentMeta: w.contentMeta,
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
    fieldSelections.value = [];
    selectedIds.value = [];
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
    if (input.content) {
      validateContent(input.content);
      if (input.apiId !== "canvas-content")
        throw new Error("Local content must use the canvas content source.");
      if (
        input.contentMeta &&
        (!isRow(input.contentMeta) ||
          !["user", "agent", "computed"].includes(input.contentMeta.origin) ||
          !Number.isFinite(Date.parse(input.contentMeta.updatedAt)) ||
          !isRow(input.contentMeta.evidence) ||
          Object.keys(input.contentMeta.evidence).length > 40 ||
          Object.values(input.contentMeta.evidence).some(
            (v) => typeof v !== "string" || v.length > 120,
          ))
      )
        throw new Error("Invalid content authorship or evidence metadata.");
    } else if (input.apiId === "canvas-content" && !input.derived)
      throw new Error("Use create_content_block to supply local content.");
    const custom = definitions
      .find((a) => a.id === input.apiId)
      ?.operations.find((o) => o.id === input.operationId);
    if (
      input.derived &&
      (!Array.isArray(input.derived.sourceIds) ||
        !input.derived.sourceIds.length ||
        input.derived.sourceIds.length > 12 ||
        input.derived.sourceIds.some(
          (id) => typeof id !== "string" || id.length > 120,
        ))
    )
      throw new Error("Derived source IDs must name 1 to 12 existing cards.");
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
  function insertWidget(input: WidgetInput, requestedId?: string) {
    if (widgets.value.length >= 40)
      throw new Error("A workspace can contain up to 40 widgets.");
    const { args, missing } = validateInput(input);
    const { operation } = getOperation(input.apiId, input.operationId);
    const selected = input.presentation ?? "auto";
    const intended = selected === "auto" ? operation.preferred : selected;
    const w: Widget = {
      content: input.content
        ? JSON.parse(JSON.stringify(input.content))
        : undefined,
      contentMeta: input.content
        ? JSON.parse(
            JSON.stringify(
              input.contentMeta ?? {
                origin: "user",
                updatedAt: new Date().toISOString(),
                evidence: {},
              },
            ),
          )
        : undefined,
      id: requestedId ?? crypto.randomUUID(),
      derived: input.derived,
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
    if (w.content && w.contentMeta) {
      w.result = contentResult(w.content, w.contentMeta);
      w.rawResponse = JSON.parse(
        JSON.stringify(w.content.records ?? w.content),
      );
      w.status = "ready";
      w.refreshedAt = w.contentMeta.updatedAt;
      w.error = undefined;
      return summary(w);
    }
    if (w.derived) {
      w.status = "ready";
      w.error = undefined;
      return summary(w);
    }
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
  async function createWidget(
    input: WidgetInput,
    signal?: AbortSignal,
    requestedId?: string,
    waitForData = true,
  ) {
    signal?.throwIfAborted();
    const widgetId = insertWidget(input, requestedId);
    const pending = refreshWidget(widgetId, signal);
    if (waitForData) await pending;
    else void pending.catch(() => undefined); // Refresh records failures on its own card.
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
    const ids = input.widgets.map((w) => insertWidget(w));
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
          (key) =>
            ![
              "compact",
              "numberFormat",
              "stockStyle",
              "stockSymbol",
              "showSource",
              "filter",
              "sort",
              "sortDirection",
              "style",
            ].includes(key),
        ) ||
        (p.props.filter !== undefined &&
          (typeof p.props.filter !== "string" ||
            p.props.filter.length > 500)) ||
        (p.props.sort !== undefined &&
          (typeof p.props.sort !== "string" || p.props.sort.length > 500)) ||
        (p.props.sortDirection !== undefined &&
          !["asc", "desc"].includes(p.props.sortDirection)) ||
        (p.props.compact !== undefined &&
          typeof p.props.compact !== "boolean") ||
        (p.props.showSource !== undefined &&
          typeof p.props.showSource !== "boolean") ||
        (p.props.stockStyle !== undefined &&
          !["candles", "line"].includes(p.props.stockStyle)) ||
        (p.props.stockSymbol !== undefined &&
          (typeof p.props.stockSymbol !== "string" ||
            p.props.stockSymbol.length > 120)) ||
        (p.props.numberFormat !== undefined &&
          !["compact", "standard"].includes(p.props.numberFormat)))
    )
      throw new Error("Invalid presentation properties.");
    validateBlockStyle(p.props?.style);
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
      content: w.content,
      contentMeta: w.contentMeta,
      derived: w.derived,
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
    const candidate = {
      ...w,
      bindings: patch.bindings ?? w.bindings,
      transforms: patch.transforms ?? w.transforms,
    };
    for (const dependency of dependencies(candidate)) getWidget(dependency);
    validateGraph(
      widgets.value.map((item) => (item.id === w.id ? candidate : item)),
    );
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
    if (patch.title !== undefined) {
      w.title = patch.title;
      if (w.content && w.contentMeta) {
        w.content.title = patch.title;
        w.result = contentResult(w.content, w.contentMeta);
        w.rawResponse = JSON.parse(
          JSON.stringify(w.content.records ?? w.content),
        );
      }
    }
    if (patch.width !== undefined) w.width = patch.width;
    w.presentation = presentation;
    w.viewError = undefined;
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
    const display = {
      ...boundResult(w, widgets.value),
      answerIds: widgets.value
        .filter((card) => card.content?.answerTo === w.id)
        .map((card) => card.id),
    };
    display.issues.push(...contentIssues(w, widgets.value));
    return {
      id: w.id,
      title: w.title,
      ...w.invocation,
      presentation: w.presentation,
      derived: w.derived,
      bindings: w.bindings,
      transforms: w.transforms,
      width: w.width,
      status: w.status,
      outcome: blockOutcome(w, display),
      envelopeId: w.result?.id,
      missingInputs: w.missingInputs,
      fields: w.result?.fields,
      displayFields: display.result?.fields,
      bindingIssues: display.issues,
      shape: w.result?.shape,
      lastUpdated: w.refreshedAt,
      error: w.error,
      content: w.content
        ? {
            kind: w.content.kind,
            body: w.content.body?.slice(0, 3000),
            question: w.content.question,
            sourceIds: w.content.sourceIds,
            citations: w.content.citations,
            answerTo: w.content.answerTo,
            answerIds: display.answerIds,
            files: w.content.files?.map(
              ({ id, name, access, mediaType, size, previewIssue }) => ({
                id,
                name,
                access,
                mediaType,
                size,
                previewIssue,
              }),
            ),
          }
        : undefined,
      authorship: w.contentMeta,
    };
  }
  function getWorkspace() {
    const blocks = widgets.value.map(summary);
    const pending = blocks
      .filter((w) =>
        ["loading", "refreshing", "draft"].includes(w.outcome.status),
      )
      .map((w) => w.id);
    const attention = blocks
      .filter((w) =>
        ["error", "blocked", "partial", "needs-input"].includes(
          w.outcome.status,
        ),
      )
      .map((w) => w.id);
    return {
      status: attention.length
        ? "partial"
        : pending.length
          ? "loading"
          : "complete",
      availability: {
        pendingBlockIds: pending,
        attentionBlockIds: attention,
        usableBlockIds: blocks
          .filter((w) => w.outcome.recordCount > 0)
          .map((w) => w.id),
        guidance:
          "Inspect per-block outcomes. Retry failed sources individually; independent cards can continue.",
      },
      id: id.value,
      title: title.value,
      revision: revision.value,
      mode: mode.value,
      widgets: blocks,
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
    const display = {
      ...boundResult(widget, widgets.value),
      answerIds: widgets.value
        .filter((card) => card.content?.answerTo === widget.id)
        .map((card) => card.id),
    };
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
    const widget = getWidget(widgetId);
    const display = {
      ...boundResult(widget, widgets.value),
      answerIds: widgets.value
        .filter((card) => card.content?.answerTo === widget.id)
        .map((card) => card.id),
    };
    display.issues.push(...contentIssues(widget, widgets.value));
    return display;
  }
  function createContent(
    content: CanvasContent,
    origin: ContentMeta["origin"] = "user",
    options: {
      blockId?: string;
      key?: string;
      width?: number;
      presentation?: PresentationSpec;
    } = {},
  ) {
    validateContent(content);
    const evidence = contentEvidence(content, widgets.value, options.blockId);
    const blockId =
      options.blockId ??
      stableId("content", { dashboard: id.value, key: options.key ?? content });
    const existing = widgets.value.find((w) => w.id === blockId);
    if (existing && !options.blockId) return summary(existing);
    if (options.blockId && !existing?.content)
      throw new Error("Choose an existing content card to edit.");
    const meta: ContentMeta = {
      origin,
      updatedAt: new Date().toISOString(),
      evidence,
    };
    const result = contentResult(content, meta);
    const presentation = options.presentation ??
      (existing?.content?.kind === content.kind
        ? existing?.presentation
        : undefined) ?? {
        type:
          content.kind === "dataset"
            ? "auto"
            : content.kind === "embed"
              ? "embed"
              : content.kind === "file"
                ? "file"
                : content.kind === "search-results"
                  ? "news"
                  : "note",
      };
    validatePresentation(presentation, {} as Widget);
    if (options.width !== undefined && !widths.includes(options.width))
      throw new Error("Choose a supported card width.");
    if (!existing)
      insertWidget(
        {
          apiId: "canvas-content",
          operationId: "content",
          arguments: {},
          content,
          contentMeta: meta,
          title: content.title,
          mode: "live",
          width: options.width ?? 6,
          presentation: presentation.type,
        },
        blockId,
      );
    const widget = getWidget(blockId);
    Object.assign(widget, {
      title: content.title,
      content: JSON.parse(JSON.stringify(content)),
      contentMeta: meta,
      result,
      rawResponse: JSON.parse(JSON.stringify(content.records ?? content)),
      status: "ready",
      refreshedAt: meta.updatedAt,
      presentation,
      viewError: undefined,
    });
    if (options.width) widget.width = options.width;
    touch();
    return summary(widget);
  }
  function setViewError(widgetId: string, error?: Widget["viewError"]) {
    const widget = widgets.value.find((w) => w.id === widgetId);
    if (widget) widget.viewError = error;
  }
  function createContents(
    items: {
      content: CanvasContent;
      key: string;
      presentation?: PresentationSpec;
      width?: number;
    }[],
    origin: ContentMeta["origin"] = "agent",
  ) {
    if (!items.length || items.length > 6)
      throw new Error("Return one to six answer blocks.");
    const ids = items.map((item) =>
      stableId("content", { dashboard: id.value, key: item.key }),
    );
    if (new Set(ids).size !== ids.length)
      throw new Error("Each answer block needs a distinct key.");
    const missing = ids.filter((id) => !widgets.value.some((w) => w.id === id));
    if (widgets.value.length + missing.length > 40)
      throw new Error(
        "This page has room for 40 cards. Remove cards or choose fewer outputs.",
      );
    for (const item of items) {
      validateContent(item.content);
      contentEvidence(item.content, widgets.value);
      if (item.presentation)
        validatePresentation(item.presentation, {} as Widget);
      if (item.width !== undefined && !widths.includes(item.width))
        throw new Error("Choose a supported card width.");
    }
    return items.map((item) => createContent(item.content, origin, item));
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
    if (
      JSON.stringify(customApis.find((a) => a.id === compiled.config.id)) ===
      JSON.stringify(compiled.config)
    )
      return {
        apiId: compiled.api.id,
        operationId: compiled.api.operations[0].id,
      };
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
    if (value.fieldSelections !== undefined)
      validateSelections(value.fieldSelections as TaggedField[], false);
    value.widgets.forEach(
      (input: WidgetInput & { mapping?: PresentationSpec }) => {
        validateInput(
          input,
          definitions.map((d: { api: ApiDefinition }) => d.api),
        );
        if (input.mapping) validatePresentation(input.mapping, {} as Widget);
      },
    );
    validateGraph(
      value.widgets.map((w: any) => ({
        ...w,
        invocation: {
          apiId: w.apiId,
          operationId: w.operationId,
          arguments: w.arguments,
          mode: w.mode,
        },
      })),
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
    fieldSelections.value = snapshot.fieldSelections ?? [];
    selectedIds.value = [];
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
    validateGraph(widgets.value);
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
  function validateSelections(fields: TaggedField[], requireSources = true) {
    if (!Array.isArray(fields) || fields.length > 100)
      throw new Error("Select up to 100 fields.");
    fields.forEach((f) => {
      if (
        !f ||
        typeof f.sourceId !== "string" ||
        !["raw", "data"].includes(f.origin) ||
        typeof f.path !== "string" ||
        !Array.isArray(f.tags) ||
        f.tags.length > 10 ||
        f.tags.some((t) => typeof t !== "string" || t.length > 40) ||
        (f.label !== undefined &&
          (typeof f.label !== "string" || f.label.length > 120)) ||
        (f.unit !== undefined &&
          (typeof f.unit !== "string" || f.unit.length > 40))
      )
        throw new Error(
          "Invalid field selection. Supply source, path, origin and short tags.",
        );
      pathParts(f.path);
      if (requireSources) getWidget(f.sourceId);
    });
  }
  function selectFields(fields: TaggedField[]) {
    validateSelections(fields);
    fieldSelections.value = JSON.parse(JSON.stringify(fields));
    touch();
    return fieldSelections.value;
  }
  function createDerived(options: {
    sourceIds: string[];
    title?: string;
    bindings?: Record<string, DataBinding>;
    transforms?: DataTransform[];
    presentation?: PresentationSpec;
    width?: number;
    key?: string;
  }) {
    if (!options.sourceIds.length || options.sourceIds.length > 12)
      throw new Error("Choose 1 to 12 source cards.");
    const sources = options.sourceIds.map(getWidget),
      anchor = sources[0];
    const units = new Set(
      fieldSelections.value
        .filter((f) => options.sourceIds.includes(f.sourceId) && f.unit)
        .map((f) => f.unit),
    );
    if (
      units.size > 1 &&
      options.transforms?.some(
        (t) =>
          ["aggregate", "derive", "group"].includes(t.op) &&
          t.method !== "count",
      )
    )
      throw new Error(
        "Selected fields use different units. Convert the source values and update their unit tags before combining measures.",
      );
    const bindings = options.bindings ?? {
      $data: { sourceId: anchor.id, path: "$", origin: "data" as const },
    };
    if (!Object.keys(bindings).length)
      throw new Error(
        "A derived block needs at least one field or dataset binding.",
      );
    const blockId = stableId("derived", {
      dashboard: id.value,
      ...options,
      bindings,
    });
    const existing = widgets.value.find((w) => w.id === blockId);
    if (existing) return summary(existing);
    const input: WidgetInput = {
      ...anchor.invocation,
      arguments: anchor.invocation.arguments,
      title: options.title ?? "Combined data",
      bindings,
      transforms: options.transforms,
      presentation: options.presentation?.type ?? "auto",
      width: options.width ?? 6,
      derived: { sourceIds: [...new Set(options.sourceIds)] },
    };
    validateInput(input);
    if (options.presentation)
      validatePresentation(options.presentation, {} as Widget);
    const candidate: Widget = {
      id: blockId,
      title: input.title!,
      invocation: anchor.invocation,
      presentation: options.presentation ?? { type: "auto" },
      width: input.width!,
      status: "ready",
      missingInputs: [],
      createdAt: new Date().toISOString(),
      derived: input.derived,
      bindings,
      transforms: options.transforms,
    };
    dependencies(candidate).forEach(getWidget);
    validateGraph([...widgets.value, candidate]);
    if (widgets.value.length >= 40)
      throw new Error("A workspace can contain up to 40 widgets.");
    widgets.value.push(candidate);
    touch();
    return summary(candidate);
  }
  const refreshAttempts = new Map<string, number>();
  function refreshDue() {
    if (document.visibilityState !== "visible") return;
    for (const w of widgets.value) {
      const config = customApis.find((a) => a.id === w.invocation.apiId);
      if (
        !w.derived &&
        config?.refreshSeconds &&
        config.method === "GET" &&
        w.invocation.mode === "live" &&
        !requests.has(w.id) &&
        Date.now() -
          Math.max(
            refreshAttempts.get(w.id) ?? 0,
            Date.parse(w.refreshedAt ?? w.createdAt),
          ) >=
          config.refreshSeconds * 1000
      ) {
        refreshAttempts.set(w.id, Date.now());
        void refreshWidget(w.id);
      }
    }
  }
  return {
    createContent,
    createContents,
    setViewError,
    fieldSelections,
    selectFields,
    createDerived,
    refreshDue,
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
