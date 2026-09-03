import { ref } from "vue";
import { contracts } from "./contracts";
import { workspaceContracts } from "./workspaceTools";
import { createToolRunner } from "./handlers";
import type { useWorkspace } from "../stores/workspace";
export const webmcpStatus = ref<
  "checking" | "available" | "unavailable" | "error"
>("checking");
export const webmcpError = ref("");
export const registeredToolNames = ref<string[]>([]);
// Keep compatibility aliases in the local runner without duplicating native schemas.
const nativeNames = new Set([
  ...workspaceContracts.map((contract) => contract.name),
  "get_workspace",
  "list_components",
  "search_api_catalog",
  "inspect_api_capability",
  "run_api",
  "refresh_widget",
  "manage_dashboard",
  "plan_goal",
  "execute_goal",
]);
export const nativeContracts = contracts.filter((contract) =>
  nativeNames.has(contract.name),
);
export async function registerTools(store: ReturnType<typeof useWorkspace>) {
  const controller = new AbortController();
  registeredToolNames.value = [];
  const context = document.modelContext;
  if (!context?.registerTool) {
    webmcpStatus.value = "unavailable";
    return () => controller.abort();
  }
  const runTool = createToolRunner(store);
  try {
    for (const contract of nativeContracts) {
      await context.registerTool(
        {
          name: contract.name,
          description: contract.description,
          inputSchema: contract.schema,
          annotations: {
            readOnlyHint: contract.readOnly ?? false,
            untrustedContentHint: true,
          },
          execute: (args: unknown, options?: { signal?: AbortSignal }) =>
            runTool(contract.name, args, options?.signal),
        },
        { signal: controller.signal },
      );
      registeredToolNames.value.push(contract.name);
    }
    webmcpStatus.value = "available";
  } catch (error) {
    controller.abort();
    registeredToolNames.value = [];
    webmcpStatus.value = "error";
    webmcpError.value = error instanceof Error ? error.message : String(error);
  }
  return () => controller.abort();
}
