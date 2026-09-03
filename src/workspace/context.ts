import type { useWorkspace } from "../stores/workspace";
import { customApis } from "../api/registry";
import { redactPublic } from "../sources/security";

export function pageContext(
  store: ReturnType<typeof useWorkspace>,
  limit = 100,
) {
  const warnings: string[] = [];
  const bounded = (value: unknown) => {
    if (Array.isArray(value) && value.length > limit) {
      warnings.push(
        `Data limited to ${limit} records. Inspect a source for more.`,
      );
      return value.slice(0, limit);
    }
    if (JSON.stringify(value)?.length > 100000) {
      warnings.push(
        "An oversized raw response is omitted. Inspect that source directly.",
      );
      return { omitted: true };
    }
    return value;
  };
  const context = {
    version: 1,
    workspaceId: store.id,
    title: store.title,
    revision: store.revision,
    selectedBlockIds: store.selectedIds,
    selectedFields: store.fieldSelections,
    sources: customApis
      .filter((a) => store.widgets.some((w) => w.invocation.apiId === a.id))
      .map((a) => ({ ...a, headers: {}, body: undefined })),
    blocks: store.widgets.map((w) => {
      const display = store.resultForWidget(w.id);
      return {
        id: w.id,
        title: w.title,
        kind: w.derived ? "derived" : "source",
        source: w.invocation,
        requestUrl: w.requestUrl,
        sourceIds: w.derived?.sourceIds,
        bindings: w.bindings ?? {},
        transforms: w.transforms ?? [],
        filters: {
          steps: (w.transforms ?? []).filter((t) => t.op === "filter"),
          tableSearch: w.presentation.props?.filter ?? "",
          tableSort: w.presentation.props?.sort,
          tableSortDirection: w.presentation.props?.sortDirection,
        },
        layout: { width: w.width, position: store.widgets.indexOf(w) },
        presentation: w.presentation,
        rawData: bounded(w.rawResponse),
        data: bounded(display.result?.data),
        fields: display.result?.fields ?? [],
        metadata: display.result?.metadata ?? {},
        provenance: display.provenance,
        freshness: {
          status: w.status,
          refreshedAt: w.refreshedAt,
          mode: w.invocation.mode,
        },
        issues: display.issues,
        error: w.error,
      };
    }),
  };
  const safe = redactPublic(context, warnings) as typeof context;
  return { ...safe, warnings: [...new Set(warnings)], untrustedContent: true };
}
