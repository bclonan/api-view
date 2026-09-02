import { ref } from "vue";
import { contracts } from "./contracts";
import { createToolRunner } from "./handlers";
import type { useWorkspace } from "../stores/workspace";
export const webmcpStatus = ref<
  "checking" | "available" | "unavailable" | "error"
>("checking");
export const webmcpError = ref("");
export async function registerTools(store: ReturnType<typeof useWorkspace>) {
  const controller = new AbortController();
  const context = document.modelContext;
  if (!context?.registerTool) {
    webmcpStatus.value = "unavailable";
    return () => controller.abort();
  }
  const runTool = createToolRunner(store);
  try {
    for (const contract of contracts) {
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
    }
    webmcpStatus.value = "available";
  } catch (error) {
    controller.abort();
    webmcpStatus.value = "error";
    webmcpError.value = error instanceof Error ? error.message : String(error);
  }
  return () => controller.abort();
}
