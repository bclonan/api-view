import { expect, test, type Page } from "@playwright/test";

async function call(page: Page, name: string, input: unknown) {
  return page.evaluate(
    async ({ name, input }) => {
      const response = await (window as any).layoutTools
        .get(name)
        .execute(input);
      return JSON.parse(response.content[0].text);
    },
    { name, input },
  );
}

async function expectFilledRows(page: Page) {
  await page.locator(".workspace-grid").evaluate(async (grid) => {
    await Promise.all(
      grid
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const layout = await page.locator(".workspace-grid").evaluate((grid) => {
    const bounds = grid.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      cards: Array.from(grid.children).map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      }),
    };
  });
  expect(layout.overflow).toBe(false);
  const rows = new Map<number, typeof layout.cards>();
  for (const card of layout.cards) {
    const top = Math.round(card.top);
    rows.set(top, [...(rows.get(top) ?? []), card]);
  }
  for (const row of rows.values()) {
    expect(Math.abs(row[0]!.left - layout.left)).toBeLessThan(2);
    expect(Math.abs(row.at(-1)!.right - layout.right)).toBeLessThan(2);
    for (let i = 1; i < row.length; i++) {
      expect(Math.abs(row[i]!.left - row[i - 1]!.right - 20)).toBeLessThan(2);
      expect(Math.abs(row[i]!.bottom - row[0]!.bottom)).toBeLessThan(2);
    }
  }
}

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`cards fill rows and reorder with persisted share at ${width}px`, async ({
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
      (window as any).layoutTools = registry;
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "Agent ready", exact: true }),
    ).toBeVisible();
    await call(page, "add_source", {
      definition: {
        id: "custom-layout-sample",
        name: "Layout example",
        baseUrl: "https://example.org",
        endpoint: "/layout",
        method: "GET",
        sampleResponse: {
          title: "Layout fixture",
          text: "Saved source data stays with its card.",
        },
      },
    });
    const ids: Record<string, string> = {};
    for (const [title, cardWidth] of [
      ["Alpha", 4],
      ["Bravo", 6],
      ["Charlie", 6],
    ] as const) {
      const result = await call(page, "create_block", {
        sourceId: "custom-layout-sample",
        title,
        width: cardWidth,
        mode: "sample",
      });
      expect(result.ok).toBe(true);
      ids[title] = result.data.id;
    }
    const labels = () =>
      page
        .locator(".workspace-grid > .widget")
        .evaluateAll((cards) =>
          cards.map((card) => card.getAttribute("aria-label")),
        );
    await expect(page.locator("[data-status=ready]")).toHaveCount(3);
    await expectFilledRows(page);
    const collapse = page.getByRole("button", {
      name: "Collapse discovery",
      exact: true,
    });
    if (await collapse.isVisible()) {
      await collapse.click();
      await expectFilledRows(page);
    }

    // Keyboard moves retain focus and use the same stored order as touch controls.
    const charlieHandle = page.getByRole("button", {
      name: "Reorder Charlie",
      exact: true,
    });
    await charlieHandle.focus();
    await charlieHandle.press("Home");
    await expect.poll(labels).toEqual(["Charlie", "Alpha", "Bravo"]);
    await expect(charlieHandle).toBeFocused();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Charlie moved to position 1 of 3." }),
    ).toBeVisible();
    await charlieHandle.press("ArrowDown");
    await expect.poll(labels).toEqual(["Alpha", "Charlie", "Bravo"]);

    await page
      .getByRole("button", { name: "Reorder Bravo", exact: true })
      .click();
    await page
      .getByLabel("Position of Bravo", { exact: true })
      .selectOption("0");
    await expect.poll(labels).toEqual(["Bravo", "Alpha", "Charlie"]);
    const bravo = page.getByRole("article", { name: "Bravo", exact: true });
    await expect(
      bravo.getByRole("button", { name: "Earlier", exact: true }),
    ).toBeDisabled();
    await bravo.getByRole("button", { name: "Later", exact: true }).click();
    await expect.poll(labels).toEqual(["Alpha", "Bravo", "Charlie"]);
    await bravo
      .getByRole("button", { name: "Close reorder controls", exact: true })
      .click();

    if (width >= 1024) {
      const target = page.getByRole("article", {
        name: "Charlie",
        exact: true,
      });
      await page
        .locator(".workspace-grid")
        .evaluate((grid) => grid.scrollIntoView({ block: "center" }));
      const handle = page.getByRole("button", {
        name: "Reorder Alpha",
        exact: true,
      });
      await handle.hover();
      const start = await handle.boundingBox();
      await page.mouse.down();
      await page.mouse.move(
        start!.x + start!.width / 2 + 10,
        start!.y + start!.height / 2 + 10,
        { steps: 5 },
      );
      await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const rect = await target.boundingBox();
      await page.mouse.move(
        rect!.x + rect!.width - 20,
        rect!.y + rect!.height / 2,
        { steps: 10 },
      );
      await page.mouse.move(
        rect!.x + rect!.width - 22,
        rect!.y + rect!.height / 2,
      );
      await page.mouse.up();
      await expect.poll(labels).toEqual(["Bravo", "Charlie", "Alpha"]);
    }
    const moved = await call(page, "move_block", {
      blockId: ids.Charlie,
      position: 0,
    });
    expect(moved.ok).toBe(true);
    await expect(
      page.locator(".workspace-grid > .widget").first(),
    ).toHaveAttribute("aria-label", "Charlie");
    const order = await labels();
    await expectFilledRows(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(labels).toEqual(order);
    await expectFilledRows(page);
    const shared = await call(page, "open_share_view", {});
    const share = await context.newPage();
    await share.setViewportSize({ width, height: 1000 });
    await share.goto(shared.data.url, { waitUntil: "domcontentloaded" });
    await expect(share.locator(".share-card")).toHaveCount(3);
    expect(
      await share
        .locator(".share-card")
        .evaluateAll((cards) =>
          cards.map((card) => card.getAttribute("aria-label")),
        ),
    ).toEqual(order);
    await expectFilledRows(share);
    await expect(share.locator("[data-reorder-handle]")).toHaveCount(0);
  });
}
