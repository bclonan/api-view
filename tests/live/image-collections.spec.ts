import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function call(page: Page, name: string, input: unknown) {
  return page.evaluate(
    async ({ name, input }) =>
      JSON.parse(
        (await (window as any).collectionTools.get(name).execute(input))
          .content[0].text,
      ),
    { name, input },
  );
}

// Real requests and images. No route interception or replacement data.
test("public image galleries, a biodiversity map and key setup render on the live site", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await mkdir("artifacts/release", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const registry = new Map();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: any) => registry.set(tool.name, tool) },
    });
    (window as any).collectionTools = registry;
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Agent ready", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Workspace title", { exact: true })
    .fill("Images and open collections");
  await page.getByLabel("Workspace title", { exact: true }).press("Tab");
  for (const input of [
    {
      sourceId: "wikimedia-commons",
      operationId: "images",
      arguments: { q: "Baltimore skyline", limit: 2 },
      title: "Baltimore photographs · Wikimedia Commons",
    },
    {
      sourceId: "met-museum",
      operationId: "search",
      arguments: { q: "sunflowers", limit: 2 },
      title: "Sunflowers · The Met collection",
    },
    {
      sourceId: "gbif",
      operationId: "occurrences",
      arguments: { scientificName: "Corvus corax", country: "US", limit: 2 },
      title: "Published raven observations · GBIF",
    },
  ]) {
    const response = await call(page, "create_block", {
      ...input,
      mode: "live",
      width: 6,
    });
    expect(
      response.ok,
      JSON.stringify(response.error ?? response.outcome),
    ).toBe(true);
    await expect(
      page.getByRole("article", { name: input.title, exact: true }),
    ).toHaveAttribute("data-status", "ready");
  }
  const key = await call(page, "create_block", {
    sourceId: "unsplash",
    operationId: "search",
    arguments: { query: "Baltimore", per_page: 2 },
    mode: "live",
    title: "Unsplash · Access Key setup",
    width: 6,
  });
  // Missing-key is the expected deployed state until the site owner configures it.
  expect(key.outcome?.status ?? key.data?.outcome?.status).toBeDefined();
  await expect(page.locator(".image-credit").first()).toContainText(
    "Wikimedia Commons",
  );
  await expect
    .poll(() =>
      page
        .locator("img.value-image")
        .evaluateAll(
          (images) =>
            images.filter(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ).length,
        ),
    )
    .toBeGreaterThan(0);
  await call(page, "collapse_sidebar", { collapsed: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/release/collections-editor-${width}.png`,
      fullPage: false,
    });
  }
  const shared = await call(page, "open_share_view", {});
  expect(shared.ok).toBe(true);
  const share = await context.newPage();
  await share.goto(shared.data.url);
  await expect(
    share.getByRole("main", { name: "Shared workspace" }),
  ).toBeVisible();
  await expect(share.locator(".share-card")).toHaveCount(4);
  await expect(share.locator(".image-credit").first()).toContainText(
    "Wikimedia Commons",
  );
  for (const width of [1440, 375]) {
    await share.setViewportSize({ width, height: 1000 });
    expect(
      await share.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await share.screenshot({
      path: `artifacts/release/collections-share-${width}.png`,
      fullPage: false,
    });
  }
  await page.reload();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(3);
  await expect(
    page.getByRole("article", {
      name: "Unsplash · Access Key setup",
      exact: true,
    }),
  ).toContainText("Unsplash needs an Access Key");
  expect(errors).toEqual([]);
});
