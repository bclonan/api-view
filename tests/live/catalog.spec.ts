import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { apis } from "../../src/api/registry";
import { exampleArguments } from "../../src/api/capabilities";

// Opt-in real network audit. A provider failure is recorded, never replaced by a fixture.
test("audit every built-in operation through browser WebMCP", async ({
  page,
}, testInfo) => {
  test.setTimeout(600000);
  await page.addInitScript(() => {
    const tools = new Map();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: any) => tools.set(tool.name, tool) },
    });
    (window as any).catalogAuditTools = tools;
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Agent ready", exact: true }),
  ).toBeVisible();
  const requests: { url: string; status?: number; error?: string }[] = [];
  page.on("response", (r) => {
    if (r.request().resourceType() === "fetch")
      requests.push({ url: r.url(), status: r.status() });
  });
  page.on("requestfailed", (r) => {
    if (r.resourceType() === "fetch")
      requests.push({ url: r.url(), error: r.failure()?.errorText });
  });
  const operations = apis
    .filter((api) => !api.id.startsWith("custom-"))
    .flatMap((api) =>
      api.operations.map((operation) => {
        const params = exampleArguments(api.id, operation.id);
        for (const key of ["limit", "rows", "pageSize", "per_page", "c"])
          if (operation.inputs[key])
            params[key] = Math.max(operation.inputs[key].minimum ?? 1, 2);
        return {
          sourceId: api.id,
          name: api.name,
          capabilityId: operation.id,
          params,
          authentication: api.authentication ?? "none",
          docs: api.docs,
        };
      }),
    );
  const outcomes: any[] = [];
  for (let i = 0; i < operations.length; i += 3) {
    const batch = await Promise.all(
      operations.slice(i, i + 3).map(async (operation) => {
        const started = Date.now();
        const result = await page.evaluate(
          async ({ sourceId, capabilityId, params }) => {
            const response = await (window as any).catalogAuditTools
              .get("run_api")
              .execute({ sourceId, capabilityId, params, mode: "live" });
            const data = JSON.parse(response.content[0].text);
            return response.isError
              ? { status: "failed", error: data.detail ?? data.error }
              : {
                  status: data.status,
                  recordCount: data.recordCount,
                  fields: data.fields.map((f: any) => f.key),
                  requestUrl: data.requestUrl,
                };
          },
          operation,
        );
        return {
          ...operation,
          testedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          ...result,
        };
      }),
    );
    outcomes.push(...batch);
    console.log(
      batch
        .map(
          (o) =>
            `${o.sourceId}/${o.capabilityId}: ${o.status}${o.error ? ` (${o.error.code})` : ` (${o.recordCount} records)`}`,
        )
        .join("\n"),
    );
  }
  const report = {
    testedAt: new Date().toISOString(),
    origin: new URL(page.url()).origin,
    sourceCount: apis.length,
    operationCount: outcomes.length,
    outcomes,
    requests,
  };
  await mkdir("artifacts/release", { recursive: true });
  const path = `artifacts/release/catalog-audit${process.env.LIVE_URL?.includes("127.0.0.1") ? "-local" : ""}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  await testInfo.attach("Live API audit", {
    path,
    contentType: "application/json",
  });
  expect(outcomes).toHaveLength(operations.length);
  for (const outcome of outcomes) {
    expect(["ready", "empty", "failed"]).toContain(outcome.status);
    if (outcome.status === "failed")
      expect(outcome.error?.message).toBeTruthy();
  }
});
