import type { IntentPlan } from "./intent";
import type { useWorkspace } from "../stores/workspace";
import { rowsOf, numberOf } from "../runtime/normalize";
import { readPath } from "../runtime/fields";
import { getCapability } from "../api/capabilities";
import { ApiFailure, normalizeError } from "../runtime/invoke";
type Runner = (
  name: string,
  input: unknown,
  signal?: AbortSignal,
) => Promise<{ isError: boolean; content: { text: string }[] }>;
export async function executeIntent(
  plan: IntentPlan,
  store: ReturnType<typeof useWorkspace>,
  run: Runner,
  signal?: AbortSignal,
) {
  if (plan.questions.length) throw new Error(plan.questions.join(" "));
  if (plan.edits) {
    const results = [];
    for (const edit of plan.edits) {
      signal?.throwIfAborted();
      const response = await run(edit.tool, edit.input, signal);
      results.push({
        error: response.isError
          ? JSON.parse(response.content[0].text).error
          : undefined,
      });
    }
    return {
      status: results.some((r) => r.error) ? "partial" : "complete",
      steps: results,
    };
  }
  if (plan.steps.length + store.widgets.length > 40)
    throw new Error("This plan would exceed 40 cards. Start a new dashboard.");
  const dashboardId = store.id,
    outputs: {
      step: number;
      cardId?: string;
      envelopeId?: string;
      error?: string;
    }[] = [];
  for (let index = 0; index < plan.steps.length; index++) {
    signal?.throwIfAborted();
    if (store.id !== dashboardId)
      throw new Error("Dashboard changed. The remaining plan was stopped.");
    const step = plan.steps[index],
      params = { ...step.params };
    try {
      if (step.dependency) {
        const previous = outputs[step.dependency.step];
        if (!previous?.envelopeId)
          throw new Error(
            "The preceding location request failed. This dependent request was skipped.",
          );
        const entry = await store.getEnvelope(previous.envelopeId),
          records = rowsOf(entry.response.result.data);
        let location;
        if (step.dependency.kind === "strongest-location") {
          const fields = entry.response.result.fields,
            measure =
              fields.find((f) => f.semanticType === "magnitude")?.key ??
              "magnitude";
          location = [...records]
            .filter((r) => Number.isFinite(numberOf(readPath(r, measure))))
            .sort(
              (a, b) =>
                numberOf(readPath(b, measure)) - numberOf(readPath(a, measure)),
            )[0];
        } else {
          const query = String(
            plan.steps[step.dependency.step].params.name,
          ).toLowerCase();
          const exact = records.filter(
            (r) => String(r.name ?? r.title).toLowerCase() === query,
          );
          if (exact.length === 1) location = exact[0];
          else if (records.length === 1) location = records[0];
          else
            throw new Error(
              "Several places matched. Use the location card to choose coordinates in the weather form.",
            );
        }
        const fields = entry.response.result.fields;
        const latitude = readPath(
            location,
            fields.find((f) => f.type === "latitude")?.key ?? "latitude",
          ),
          longitude = readPath(
            location,
            fields.find((f) => f.type === "longitude")?.key ?? "longitude",
          );
        if (latitude == null || longitude == null)
          throw new Error(
            "No location was returned. Weather was not requested.",
          );
        params.latitude = numberOf(latitude);
        params.longitude = numberOf(longitude);
      }
      const request = await run(
        "run_api",
        {
          sourceId: step.sourceId,
          capabilityId: step.capabilityId,
          params,
          mode: store.mode,
        },
        signal,
      );
      const data = JSON.parse(request.content[0].text);
      if (request.isError)
        throw new ApiFailure(
          data.detail ?? normalizeError(new Error(data.error)),
        );
      const suggestions = await run(
        "suggest_views",
        { envelopeId: data.envelopeId },
        signal,
      );
      const views = JSON.parse(suggestions.content[0].text).views;
      const view =
        views.find((v: any) => v.id === step.presentation && v.compatible) ??
        views.find((v: any) => v.compatible);
      const card = await run(
        "add_card",
        {
          envelopeId: data.envelopeId,
          title: step.title,
          presentation: view?.presentation ?? { type: "table" },
          width: step.width,
        },
        signal,
      );
      const added = JSON.parse(card.content[0].text);
      if (card.isError) throw new Error(added.error);
      outputs.push({
        step: index,
        cardId: added.id,
        envelopeId: data.envelopeId,
      });
    } catch (error) {
      if (store.id !== dashboardId || signal?.aborted) throw error;
      const { api, operation } = getCapability(
        step.sourceId,
        step.capabilityId,
      );
      const failed = store.recordFailedRequest(
        {
          apiId: api.id,
          operationId: operation.id,
          arguments: params,
          title: step.title,
          width: step.width,
          presentation: step.presentation,
          mode: store.mode,
        },
        error,
      );
      outputs.push({
        step: index,
        cardId: failed.id,
        error: normalizeError(error).message,
      });
    }
  }
  if (plan.comparison) {
    const chemicals = outputs.filter(
      (o) => o.cardId && plan.steps[o.step].sourceId === "pubchem",
    );
    if (chemicals.length > 1) {
      const first = chemicals[0];
      const copy = await run(
        "duplicate_card",
        { cardId: first.cardId, presentation: { type: "comparison" } },
        signal,
      );
      if (!copy.isError) {
        const id = JSON.parse(copy.content[0].text).id;
        await run(
          "update_card",
          {
            cardId: id,
            title: "Compound comparison",
            width: 12,
            transforms: chemicals
              .slice(1)
              .map((c) => ({ op: "merge", sourceId: c.cardId })),
          },
          signal,
        );
      }
    }
  }
  return {
    status: outputs.some((o) => o.error) ? "partial" : "complete",
    steps: outputs,
  };
}
