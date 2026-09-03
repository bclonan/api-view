import { test, expect, type Page } from "@playwright/test";
const photo = {
  id: "fixture-photo",
  alt_description: "Photo fixture for attribution",
  urls: { small: "https://images.unsplash.com/photo-fixture?ixid=preserved" },
  user: {
    name: "Fixture photographer",
    links: { html: "https://unsplash.com/@fixture" },
  },
  links: { html: "https://unsplash.com/photos/fixture-photo" },
};
async function call(page: Page, name: string, input: unknown) {
  return page.evaluate(
    async ({ name, input }) =>
      JSON.parse(
        (await (window as any).imageTools.get(name).execute(input)).content[0]
          .text,
      ),
    { name, input },
  );
}
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`image search, key recovery and credits survive sharing at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      const registry = new Map();
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: { registerTool: (tool: any) => registry.set(tool.name, tool) },
      });
      (window as any).imageTools = registry;
    });
    let state: "missing" | "ready" | "empty" = "missing";
    await context.route("**/.netlify/functions/unsplash?*", (route) =>
      route.fulfill({
        status: state === "missing" ? 503 : 200,
        json:
          state === "missing"
            ? {
                error: {
                  code: "authentication-required",
                  title: "Unsplash needs an Access Key",
                  message:
                    "Configure UNSPLASH_ACCESS_KEY in Netlify Functions, then redeploy.",
                },
              }
            : {
                total: state === "empty" ? 0 : 1,
                results: state === "empty" ? [] : [photo],
              },
      }),
    );
    await context.route("https://images.unsplash.com/photo-fixture*", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#d7dfcf"/><text x="30" y="90">Controlled image fixture</text></svg>',
      }),
    );
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Agent ready", exact: true }),
    ).toBeVisible();
    if (
      await page
        .getByRole("button", { name: "Open discovery", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Open discovery", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Unsplash API key required", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Search Unsplash photos",
      exact: true,
    });
    await expect(dialog).toContainText("UNSPLASH_ACCESS_KEY");
    await expect(dialog).toContainText("Secret Key is not needed");
    await dialog
      .getByLabel("Data source", { exact: true })
      .selectOption("live");
    await dialog
      .getByLabel("Photo subject Required", { exact: true })
      .fill("Baltimore");
    await dialog
      .getByRole("button", { name: "Add to workspace", exact: true })
      .click();
    const card = page.getByRole("article", {
      name: "Search Unsplash photos",
      exact: true,
    });
    await expect(card).toContainText("Unsplash needs an Access Key");
    const blocks = await call(page, "list_blocks", {});
    expect(blocks.data.widgets[0].outcome.issues[0].retryable).toBe(false);
    state = "ready";
    await card
      .getByRole("button", { name: "Retry request", exact: true })
      .click();
    await expect(card.locator(".image-credit")).toContainText(
      "Fixture photographer",
    );
    await expect(
      card
        .locator(".image-credit")
        .getByRole("link", { name: "Unsplash", exact: true }),
    ).toHaveAttribute("href", /utm_source=api_canvas/);
    await expect(card.locator("img.value-image")).toHaveAttribute(
      "src",
      /ixid=preserved/,
    );
    await page.reload();
    await expect(card.locator(".image-credit")).toContainText(
      "Fixture photographer",
    );
    const shared = await call(page, "open_share_view", {});
    expect(shared.ok).toBe(true);
    const share = await context.newPage();
    await share.setViewportSize({ width, height: 1000 });
    await share.goto(shared.data.url);
    await expect(
      share.getByRole("main", { name: "Shared workspace" }),
    ).toBeVisible();
    await expect(share.locator(".image-credit")).toContainText(
      "Fixture photographer",
    );
    expect(
      await share.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await share.close();
    await page
      .getByRole("dialog", { name: "Share this workspace", exact: true })
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const changed = await call(page, "update_block", {
      blockId: blocks.data.widgets[0].id,
      patch: {
        presentation: { type: "table", fields: ["title", "image_url"] },
      },
    });
    expect(changed.ok).toBe(true);
    await expect(card.locator(".image-credit")).toContainText(
      "Fixture photographer",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    state = "empty";
    const empty = await call(page, "run_api", {
      sourceId: "unsplash",
      capabilityId: "search",
      params: { query: "no-results-query" },
      mode: "live",
    });
    expect(empty.status).toBe("empty");
    expect(empty.recordCount).toBe(0);
  });
}

test("the explorer exposes the new public collection forms", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Wikimedia Commons Images",
    "The Metropolitan Museum of Art Art",
    "GBIF Biodiversity Nature",
    "iNaturalist Nature",
    "NASA EONET Nature",
    "National Weather Service Alerts Weather",
    "Nobel Prize Science",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("No authentication");
    await expect(
      dialog.getByRole("button", { name: "Add to workspace", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }
});
