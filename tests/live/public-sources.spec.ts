import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Opt-in release check. These are real network responses, never intercepted fixtures.
async function call(page: Page, name: string, input: unknown) {
  const result = await page.evaluate(
    async ({ name, input }) => {
      const registry = (window as any).releaseTools;
      return JSON.parse(
        (await registry.get(name).execute(input)).content[0].text,
      );
    },
    { name, input },
  );
  expect(result.ok, JSON.stringify(result.error)).toBe(true);
  return result.data;
}

test("real public API and permitted HTML remain connected in editor and share", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const registry = new Map();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: any) => registry.set(tool.name, tool) },
    });
    (window as any).releaseTools = registry;
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Agent ready", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).releaseTools.size)).toBe(31);
  await page
    .getByLabel("Workspace title", { exact: true })
    .fill("Public source connections");
  await page.getByLabel("Workspace title", { exact: true }).press("Tab");
  await page
    .getByRole("combobox", {
      name: "Default data mode for new widgets",
      exact: true,
    })
    .selectOption("live");
  for (const [url, html] of [
    ["https://api.nobelprize.org/2.1/nobelPrizes?limit=3", false],
    [
      "https://cdn.jsdelivr.net/gh/mdn/learning-area@main/css/styling-boxes/styling-tables/punk-bands-complete.html",
      true,
    ],
  ] as const) {
    await page
      .getByRole("button", { name: "Add public source", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Discover a public source",
    });
    await dialog.getByLabel("Source URL or topic").fill(url);
    if (html)
      await dialog.getByRole("checkbox", { name: /I have permission/ }).check();
    await dialog
      .getByRole("button", { name: "Discover source", exact: true })
      .click();
    await expect(
      dialog.getByRole("region", { name: "Source inspection" }),
    ).toBeVisible({ timeout: 30000 });
    await dialog
      .getByRole("button", { name: "Add source card", exact: true })
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 30000 });
  }
  await expect(page.locator('[data-status="ready"]')).toHaveCount(2);
  const workspace = await call(page, "list_blocks", {});
  const [nobel, bands] = workspace.widgets;
  await call(page, "update_block", {
    blockId: nobel.id,
    patch: {
      title: "Nobel awards · 1901",
      width: 6,
      bindings: {
        year: { path: "awardYear", label: "Award year" },
        category: { path: "category.en", label: "Category" },
        date: { path: "dateAwarded", label: "Award date" },
      },
      presentation: { type: "table", fields: ["year", "category", "date"] },
    },
  });
  await call(page, "update_block", {
    blockId: bands.id,
    patch: {
      title: "Punk bands · MDN educational example",
      width: 6,
      presentation: {
        type: "bar-chart",
        xField: "Band",
        yField: '["No. of Albums"]',
      },
    },
  });
  await call(page, "select_map_tag_fields", {
    fields: [
      {
        sourceId: nobel.id,
        path: "nobelPrizes[0].category.en",
        origin: "raw",
        tags: ["nobel"],
      },
      {
        sourceId: bands.id,
        path: "[1].Band",
        origin: "data",
        tags: ["educational-example"],
      },
    ],
  });
  const combined = await call(page, "create_derived_block", {
    sourceIds: [nobel.id, bands.id],
    title: "Selected fields from both sources",
    width: 12,
    presentation: { type: "record" },
    bindings: {
      title: { literal: "Public data selections" },
      description: {
        literal:
          "Independent selections from a live API and an educational HTML table.",
      },
      award_category: {
        sourceId: nobel.id,
        path: "nobelPrizes[0].category.en",
        origin: "raw",
        label: "Nobel category",
      },
      example_band: {
        sourceId: bands.id,
        path: "[1].Band",
        origin: "data",
        label: "MDN example band",
      },
    },
  });
  await call(page, "move_block", { blockId: combined.id, position: 0 });
  await call(page, "collapse_sidebar", { collapsed: true });
  const data = await call(page, "get_page_context", {});
  expect(data.sources).toHaveLength(2);
  expect(data.selectedFields).toHaveLength(2);
  expect(data.blocks[0].data[0]).toMatchObject({
    award_category: "Chemistry",
    example_band: "The Clash",
  });
  await page.reload();
  const card = page.getByRole("article", {
    name: "Selected fields from both sources",
    exact: true,
  });
  await expect(card).toContainText("The Clash");
  await expect(
    page.getByRole("article", { name: "Nobel awards · 1901", exact: true }),
  ).not.toContainText("1,901");
  await expect(
    page.getByRole("button", { name: "Open discovery", exact: true }),
  ).toBeVisible();
  await mkdir("artifacts/release", { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: `artifacts/release/editor-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Share / present", exact: true })
    .click();
  const url = await page
    .getByRole("link", { name: "Open clean share view" })
    .getAttribute("href");
  const shared = await context.newPage();
  await shared.goto(url!);
  await shared.reload();
  await expect(
    shared.getByRole("main", { name: "Shared workspace" }),
  ).toBeVisible();
  await expect(
    shared.getByRole("article", {
      name: "Selected fields from both sources",
      exact: true,
    }),
  ).toContainText("The Clash");
  await expect(shared.locator(".discover")).toHaveCount(0);
  await expect(
    shared.getByRole("button", {
      name: /Options for|Change visualization|Export CSV/,
    }),
  ).toHaveCount(0);
  for (const width of [1440, 375]) {
    await shared.setViewportSize({ width, height: 1000 });
    expect(
      await shared.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await shared.screenshot({
      animations: "disabled",
      path: `artifacts/release/share-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
