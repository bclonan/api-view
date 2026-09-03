import { test, expect, type Page } from "@playwright/test";

async function installSources(page: Page) {
  await page.addInitScript(() => {
    const registry = new Map();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: any) => registry.set(tool.name, tool) },
    });
    (window as any).testTools = registry;
  });
  await page.route("https://metrics.example.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        records: [
          { id: "A", count: 24 },
          { id: "B", count: 36 },
        ],
      }),
    }),
  );
  await page.route("https://regions.example.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: route.request().url().endsWith("robots.txt")
        ? "text/plain"
        : "text/html",
      body: route.request().url().endsWith("robots.txt")
        ? "User-agent: *\nAllow: /"
        : "<!doctype html><html><title>Public regions</title><table><tr><th>id</th><th>region</th></tr><tr><td>A</td><td>East</td></tr><tr><td>B</td><td>West</td></tr></table></html>",
    }),
  );
}
async function addSource(page: Page, url: string, html = false) {
  await page
    .getByRole("button", { name: "Add public source", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Discover a public source" });
  await dialog.getByLabel("Source URL or topic").fill(url);
  if (html)
    await dialog.getByRole("checkbox", { name: /I have permission/ }).check();
  await dialog
    .getByRole("button", { name: "Discover source", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Source inspection" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Add source card", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`source to derived block and clean persistent share at ${width}px`, async ({
    page,
    context,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 960 });
    await installSources(page);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Agent ready" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => [...(window as any).testTools.keys()]),
    ).toContain("create_derived_block");
    await addSource(page, "https://metrics.example.org/observations");
    await addSource(page, "https://regions.example.org/table", true);
    await expect(page.locator('[data-status="ready"]')).toHaveCount(2);
    await page
      .getByLabel("Workspace title", { exact: true })
      .fill("Public data connections");
    await page.getByLabel("Workspace title", { exact: true }).press("Tab");
    await page
      .getByRole("button", { name: "Connect data", exact: true })
      .click();
    const composition = page.getByRole("dialog", {
      name: "Connect data to a new block",
    });
    await composition
      .getByLabel("Composition source")
      .selectOption({ label: "metrics.example.org" });
    await composition.getByLabel("Tags", { exact: true }).fill("population");
    await composition
      .getByRole("button", { name: "Use source rows", exact: true })
      .click();
    await composition.getByText("Join or group rows", { exact: true }).click();
    await composition
      .getByLabel("Join source", { exact: true })
      .selectOption({ label: "Public regions" });
    await composition.getByLabel("Left key", { exact: true }).fill("id");
    await composition.getByLabel("Right key", { exact: true }).fill("id");
    await composition
      .getByRole("button", { name: "Add join", exact: true })
      .click();
    await composition
      .getByLabel("Derived block title")
      .fill("Counts by region");
    await composition.getByLabel("Derived block view").selectOption("table");
    await noOverflow(page);
    await composition
      .getByRole("button", { name: "Create derived block", exact: true })
      .click();
    const derived = page.getByRole("article", {
      name: "Counts by region",
      exact: true,
    });
    await expect(derived).toContainText("East");
    await expect(derived).toContainText("24");
    await page
      .getByRole("button", { name: "Use all page data", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "All page data" }),
    ).toContainText("selectedFields");
    const contextResult = await page.evaluate(async () =>
      JSON.parse(
        (await (window as any).testTools.get("get_page_context").execute({}))
          .content[0].text,
      ),
    );
    expect(contextResult.data.selectedFields[0].tags).toEqual(["population"]);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close dialog" })
      .click();
    if (
      await page
        .getByRole("button", { name: "Open discovery", exact: true })
        .count()
    )
      await page
        .getByRole("button", { name: "Open discovery", exact: true })
        .click();
    if (width <= 600)
      await page
        .getByRole("button", { name: "Close discovery", exact: true })
        .click();
    else
      await page
        .getByRole("button", { name: "Collapse discovery", exact: true })
        .click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Open discovery", exact: true }),
    ).toBeVisible();
    await expect(derived).toContainText("West");
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`editor-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Share / present", exact: true })
      .click();
    const link = await page
      .getByRole("link", { name: "Open clean share view" })
      .getAttribute("href");
    expect(link).toContain("#share=");
    const shared = await context.newPage();
    await shared.setViewportSize({ width, height: 960 });
    await shared.goto(link!);
    await shared.reload();
    await expect(
      shared.getByRole("main", { name: "Shared workspace" }),
    ).toBeVisible();
    await expect(
      shared.getByRole("article", { name: "Counts by region", exact: true }),
    ).toContainText("West");
    await expect(
      shared.getByRole("button", {
        name: /Options for|Add public source|Change visualization|Export CSV/,
      }),
    ).toHaveCount(0);
    await expect(shared.locator(".discover")).toHaveCount(0);
    await noOverflow(shared);
    await shared.screenshot({
      path: info.outputPath(`share-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close dialog" })
      .click();
    await expect(derived).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test("source errors are visible and WebMCP destructive operations require a human", async ({
  page,
}) => {
  await installSources(page);
  await page.route("https://limited.example.org/**", (r) =>
    r.fulfill({
      status: 429,
      headers: { "Retry-After": "60" },
      body: "rate limited",
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add public source", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Source URL or topic")
    .fill("https://limited.example.org/data");
  await dialog
    .getByRole("button", { name: "Discover source", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("429");
  await expect(
    dialog.getByRole("button", { name: "Add source card" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await addSource(page, "https://metrics.example.org/observations");
  const id = await page
    .locator("[data-widget-id]")
    .getAttribute("data-widget-id");
  const reply = await page.evaluate(
    async (id) =>
      (window as any).testTools.get("delete_block").execute({ blockId: id }),
    id,
  );
  expect(JSON.parse(reply.content[0].text).data.status).toBe(
    "awaiting-confirmation",
  );
  await expect(page.locator("[data-widget-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Keep block", exact: true }).click();
  await expect(page.locator("[data-widget-id]")).toHaveCount(1);
});
