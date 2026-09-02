import Ajv from "ajv";
import { ref } from "vue";
import { contracts } from "./contracts";
import { getOperation, searchApis } from "../api/registry";
import { invoke, normalizeError } from "../runtime/invoke";
import { useWorkspace } from "../stores/workspace";
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
            method: "GET",
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
    return {
      isError: !ok,
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  };
}
