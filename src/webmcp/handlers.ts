import Ajv from "ajv";
import { ref } from "vue";
import { contracts } from "./contracts";
import { getOperation, searchApis } from "../api/registry";
import { invoke, normalizeError } from "../runtime/invoke";
import { useWorkspace } from "../stores/workspace";
import { compatibleComponents } from "../blocks/definitions";
import { searchCapabilities, inspectCapability } from "../api/capabilities";
import { writeLocal, readLocal } from "../runtime/persistence";
import { planIntent } from "../workspace/intent";
import { executeIntent } from "../workspace/executeIntent";
const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
const validators = new Map(
  contracts.map((c) => [c.name, ajv.compile(c.schema)]),
);
export const toolLog = ref<
  {
    id: string;
    tool: string;
    time: string;
    duration: number;
    ok: boolean;
    message: string;
  }[]
>([]);
void readLocal<(typeof toolLog)["value"]>("action-log").then((log) => {
  if (log && !toolLog.value.length) toolLog.value = log;
});
export function createToolRunner(store: ReturnType<typeof useWorkspace>) {
  return async function runTool(
    name: string,
    input: unknown,
    signal?: AbortSignal,
  ) {
    const start = performance.now();
    let output: unknown;
    let ok = true;
    try {
      signal?.throwIfAborted();
      const validate = validators.get(name);
      if (!validate) throw new Error(`Unknown tool: ${name}`);
      if (!validate(input)) throw new Error(ajv.errorsText(validate.errors));
      const a = input as any;
      store.checkRevision(a.expectedRevision);
      switch (name) {
        case "propose_api":
          output = store.proposeApi(a.definition);
          break;
        case "plan_goal":
          output = planIntent(a.prompt, new Date(), store);
          break;
        case "execute_goal":
          output = await executeIntent(
            planIntent(a.prompt, new Date(), store),
            store,
            runTool,
            signal,
          );
          break;
        case "search_api_catalog":
          output = {
            matches: searchCapabilities(a.query, {
              ...a,
              health: store.health,
            }),
          };
          break;
        case "inspect_api_capability":
          output = inspectCapability(a.sourceId, a.capabilityId);
          break;
        case "run_api":
          output = await store.runApi(
            a.sourceId,
            a.capabilityId,
            a.params,
            a.mode ?? store.mode,
            signal,
          );
          break;
        case "inspect_data":
          output = await store.inspectData(
            a.envelopeId,
            a.origin,
            a.path,
            a.limit,
          );
          break;
        case "suggest_views":
          output = {
            views: compatibleComponents(
              (await store.getEnvelope(a.envelopeId)).response.result,
            ),
          };
          break;
        case "add_card":
          output = await store.addCard(a.envelopeId, a);
          break;
        case "update_card": {
          const { cardId, expectedRevision, ...patch } = a;
          output = await store.updateWidget(
            store.resolveCard(cardId).id,
            patch,
            false,
            signal,
          );
          break;
        }
        case "duplicate_card":
          output = await store.duplicateCard(
            store.resolveCard(a.cardId).id,
            a.presentation,
          );
          break;
        case "transform_data":
          output = await store.updateWidget(
            store.resolveCard(a.cardId).id,
            { transforms: a.steps },
            false,
            signal,
          );
          break;
        case "combine_data":
          output = await store.updateWidget(
            store.resolveCard(a.cardId).id,
            { bindings: a.bindings, transforms: a.transforms },
            false,
            signal,
          );
          break;
        case "select_cards":
          output = store.selectCards(a.cardIds);
          break;
        case "test_source":
          output = await store.testSource(
            a.sourceId,
            a.capabilityId,
            a.params,
            signal,
          );
          break;
        case "search_apis":
          output = {
            matches: searchApis(
              a.query,
              a.category,
              a.limit ?? 8,
              a.auth ?? "none",
            ),
          };
          break;
        case "describe_api": {
          const { api, operation } = getOperation(a.apiId, a.operationId);
          output = {
            apiId: api.id,
            operationId: operation.id,
            name: operation.title,
            description: operation.description,
            inputs: operation.inputs,
            semanticFields: operation.hints ?? {},
            preferredPresentation: operation.preferred,
            endpoint: operation.endpoint,
            method: operation.method ?? "GET",
            docs: api.docs,
            authentication: api.authentication ?? "none",
            modes: api.liveNotice ? ["sample"] : ["sample", "live"],
            availability: api.liveNotice,
          };
          break;
        }
        case "invoke_api": {
          const result = await invoke(
            a.apiId,
            a.operationId,
            a.arguments,
            a.mode ?? store.mode,
            signal,
          );
          const serialized = JSON.stringify(result);
          output =
            serialized.length <= 100000
              ? result
              : {
                  result: {
                    ...result.result,
                    data: Array.isArray(result.result.data)
                      ? result.result.data.slice(0, 10)
                      : String(JSON.stringify(result.result.data)).slice(
                          0,
                          20000,
                        ),
                  },
                  requestUrl: result.requestUrl,
                  truncated: true,
                  message:
                    "Tool output shortened. Use a smaller result limit for complete data.",
                };
          break;
        }
        case "create_widget":
          output = await store.createWidget(a, signal);
          break;
        case "create_dashboard":
          output = await store.createDashboard(a, signal);
          break;
        case "update_widget":
          output = await store.updateWidget(
            a.widgetId,
            a.patch,
            a.reinvoke ?? true,
            signal,
          );
          break;
        case "refresh_widget":
          output = await store.refreshWidget(a.widgetId, signal);
          break;
        case "refresh_widgets":
          output = await store.refreshWidgets(a.widgetIds, signal);
          break;
        case "transform_widget":
          output = await store.transformWidget(
            a.widgetId,
            {
              type: a.presentation,
              xField: a.xField,
              yField: a.yField,
              fields: a.fields,
            },
            a.width,
          );
          break;
        case "remove_widget":
          output = store.removeWidget(a.widgetId);
          break;
        case "get_workspace":
          output = store.getWorkspace();
          break;
        case "export_workspace":
          output = store.exportWorkspace();
          break;
        case "inspect_widget":
          output = store.inspectWidget(a.widgetId);
          break;
        case "list_components":
          output = {
            components: compatibleComponents(
              a.widgetId ? store.resultForWidget(a.widgetId).result : undefined,
            ),
          };
          break;
        case "define_api":
          output = store.defineCustomApi(a.definition);
          break;
        case "manage_dashboard": {
          if (["clear", "delete"].includes(a.action) && a.confirm !== true)
            throw new Error(
              "Confirm this destructive dashboard action explicitly.",
            );
          if (a.action === "create") output = await store.newDashboard(a.title);
          else if (a.action === "switch")
            output = await store.switchDashboard(a.dashboardId);
          else if (a.action === "duplicate")
            output = await store.duplicateDashboard(a.title);
          else if (a.action === "rename") {
            if (!a.title) throw new Error("A title is required.");
            store.rename(a.title);
            output = store.getWorkspace();
          } else if (a.action === "delete") {
            if (!a.dashboardId)
              throw new Error("Specify the dashboard ID to delete.");
            output = await store.deleteDashboard(a.dashboardId);
          } else if (a.action === "clear") {
            if (a.dashboardId !== store.id)
              throw new Error("Specify the active dashboard ID to clear.");
            output = store.clearDashboard();
          } else {
            await store.undoClear();
            output = store.getWorkspace();
          }
          break;
        }
      }
    } catch (error) {
      ok = false;
      output = {
        error: error instanceof Error ? error.message : String(error),
        detail: normalizeError(error),
      };
    }
    toolLog.value.unshift({
      id: crypto.randomUUID(),
      tool: name,
      time: new Date().toISOString(),
      duration: Math.round(performance.now() - start),
      ok,
      message: ok ? "Completed" : (output as { error: string }).error,
    });
    toolLog.value = toolLog.value.slice(0, 50);
    void writeLocal("action-log", toolLog.value);
    return {
      isError: !ok,
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  };
}
