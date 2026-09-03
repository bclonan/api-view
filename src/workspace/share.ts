import type { useWorkspace } from "../stores/workspace";
import type { Widget, TaggedField, CustomApiConfig } from "../types";
import { redactPublic } from "../sources/security";
import { validateDataSettings, validateGraph } from "../runtime/bindings";
import { presentations } from "../types";

export interface ShareState {
  version: 1;
  title: string;
  capturedAt: string;
  settings: { columns: 12; showProvenance: boolean };
  sources: CustomApiConfig[];
  widgets: Widget[];
  selectedFields: TaggedField[];
  warnings: string[];
}
export function shareState(store: ReturnType<typeof useWorkspace>): ShareState {
  const warnings: string[] = [];
  const state: ShareState = {
    version: 1,
    title: store.title,
    capturedAt: new Date().toISOString(),
    settings: { columns: 12, showProvenance: true },
    sources: store
      .exportWorkspace()
      .customApis.map((api) => ({
        ...api,
        headers: {},
        body: undefined,
        inputs: api.inputs,
        sampleResponse: [],
      })),
    widgets: store.widgets.map((w) => JSON.parse(JSON.stringify(w))),
    selectedFields: store.fieldSelections,
    warnings,
  };
  if (
    store
      .exportWorkspace()
      .customApis.some(
        (api) => Object.keys(api.headers ?? {}).length || api.body,
      )
  )
    warnings.push("Request headers and bodies are excluded from shared state.");
  const safe = redactPublic(state, warnings) as ShareState;
  safe.warnings = [...new Set(warnings)];
  return safe;
}
export function encodeShare(state: ShareState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  if (bytes.length > 500000)
    throw new Error(
      "This snapshot is over 500 KB. Limit source rows or remove large raw responses before creating a share link.",
    );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decodeShare(encoded: string): ShareState {
  if (encoded.length > 700000 || !/^[A-Za-z0-9_-]+$/.test(encoded))
    throw new Error("Invalid or oversized share link.");
  const state = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(encoded.replaceAll("-", "+").replaceAll("_", "/")),
        (c) => c.charCodeAt(0),
      ),
    ),
  ) as ShareState;
  if (
    state.version !== 1 ||
    typeof state.title !== "string" ||
    state.title.length > 120 ||
    !Array.isArray(state.widgets) ||
    state.widgets.length > 40 ||
    !Array.isArray(state.sources) ||
    state.sources.length > 30 ||
    !Array.isArray(state.selectedFields) ||
    state.selectedFields.length > 100
  )
    throw new Error("This share link does not contain a valid workspace.");
  const ids = new Set<string>();
  for (const w of state.widgets) {
    if (
      typeof w.id !== "string" ||
      w.id.length > 120 ||
      ids.has(w.id) ||
      typeof w.title !== "string" ||
      w.title.length > 120 ||
      !w.invocation ||
      !w.presentation ||
      !presentations.includes(w.presentation.type) ||
      ![3, 4, 6, 8, 12].includes(w.width)
    )
      throw new Error("Invalid block in the shared workspace.");
    ids.add(w.id);
    validateDataSettings(w.bindings, w.transforms);
    if (
      w.result &&
      (!Array.isArray(w.result.fields) ||
        !Array.isArray(w.result.suggestedPresentations) ||
        !w.result.source)
    )
      throw new Error("Invalid shared source data.");
    if (
      w.derived &&
      (!Array.isArray(w.derived.sourceIds) || w.derived.sourceIds.length > 12)
    )
      throw new Error("Invalid shared source connections.");
  }
  validateGraph(state.widgets);
  return redactPublic(state, []) as ShareState;
}
export function shareLink(store: ReturnType<typeof useWorkspace>) {
  const state = shareState(store);
  return {
    url: `${location.origin}/#share=${encodeShare(state)}`,
    warnings: state.warnings,
    capturedAt: state.capturedAt,
  };
}
