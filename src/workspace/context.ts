import type { useWorkspace } from "../stores/workspace";
import { customApis } from "../api/registry";
import { redactPublic } from "../sources/security";
import { blockOutcome } from "../runtime/outcomes";
import { rowsOf } from "../runtime/normalize";
import { fileStates } from "../runtime/localFiles";

export function visibleData(data: unknown, filter?: string) {
  if (!filter?.trim()) return data;
  const query = filter.toLocaleLowerCase().trim();
  return rowsOf(data).filter((row) =>
    JSON.stringify(row).toLocaleLowerCase().includes(query),
  );
}

export function pageContext(
  store: ReturnType<typeof useWorkspace>,
  limit = 100,
  blockIds?: string[],
) {
  if (blockIds?.some((id) => !store.widgets.some((w) => w.id === id)))
    throw new Error(
      "A selected card was removed. Read list_blocks and choose current IDs.",
    );
  const widgets = blockIds
    ? store.widgets.filter((w) => blockIds.includes(w.id))
    : store.widgets;
  const warnings: string[] = [];
  const bounded = (value: unknown) => {
    if (Array.isArray(value) && value.length > limit) {
      warnings.push(
        `Data limited to ${limit} records. Inspect a source for more.`,
      );
      value = value.slice(0, limit);
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
    selectedBlockIds: store.selectedIds.filter((id) =>
      widgets.some((w) => w.id === id),
    ),
    selectedFields: store.fieldSelections.filter((field) =>
      widgets.some((w) => w.id === field.sourceId),
    ),
    sources: customApis
      .filter((a) => widgets.some((w) => w.invocation.apiId === a.id))
      .map((a) => ({ ...a, headers: {}, body: undefined })),
    blocks: widgets.map((w) => {
      const display = store.resultForWidget(w.id);
      return {
        id: w.id,
        title: w.title,
        kind: w.content ? "content" : w.derived ? "derived" : "source",
        content: bounded(w.content),
        answerIds: display.answerIds,
        localFiles: w.content?.files?.map((file) => ({
          id: file.id,
          name: file.name,
          dataSnapshot: file.data !== undefined,
          state: fileStates.get(file.id) ?? {
            code: "local_file_unverified",
            message:
              "Original file availability has not been checked. Any supplied data is a saved snapshot.",
          },
        })),
        authorship: w.contentMeta,
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
        visibleData: bounded(
          visibleData(display.result?.data, w.presentation.props?.filter),
        ),
        fields: display.result?.fields ?? [],
        metadata: bounded(display.result?.metadata ?? {}),
        provenance: display.provenance,
        freshness: {
          status: w.status,
          refreshedAt: w.refreshedAt,
          mode: w.invocation.mode,
        },
        issues: display.issues,
        outcome: blockOutcome(w, display),
        error: w.error,
      };
    }),
  };
  const safe = redactPublic(context, warnings) as typeof context;
  return { ...safe, warnings: [...new Set(warnings)], untrustedContent: true };
}
