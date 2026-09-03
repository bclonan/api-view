import { test, expect, type Page } from "@playwright/test";
import {
  teamFixture,
  scheduleFixture,
  placeFixture,
  newsFixture,
  eventFixture,
  personFixture,
  productFixture,
} from "../fixtures/scenarios";

async function call(page: Page, name: string, input: unknown) {
  return page.evaluate(
    async ({ name, input }) => {
      const response = await (window as any).scenarioTools
        .get(name)
        .execute(input);
      return {
        isError: response.isError,
        ...JSON.parse(response.content[0].text),
      };
    },
    { name, input },
  );
}
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`adaptive cards, source failures and editable share at ${width}px`, async ({
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
      (window as any).scenarioTools = registry;
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let unavailable = true;
    await page.route("https://scenario.example.org/**", (route) =>
      route.fulfill(
        unavailable
          ? {
              status: 429,
              headers: {
                "Retry-After": "30",
                "Access-Control-Expose-Headers": "Retry-After",
              },
              body: "Rate limited",
            }
          : {
              contentType: "application/json",
              body: JSON.stringify(newsFixture),
            },
      ),
    );
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Agent ready", exact: true }),
    ).toBeVisible();
    const examples = [
      ["sports-team", teamFixture],
      ["sports-score", scheduleFixture],
      ["places", placeFixture],
      ["news", newsFixture],
      ["events", eventFixture],
      ["person", personFixture],
      ["product", productFixture],
    ] as const;
    const blocks: Record<string, string> = {};
    for (const [kind, sampleResponse] of examples) {
      const id = `custom-test-${kind}`;
      expect(
        (
          await call(page, "add_source", {
            definition: {
              id,
              name: `Example ${kind}`,
              baseUrl: "https://scenario.example.org",
              endpoint: `/${kind}`,
              method: "GET",
              sampleResponse,
            },
          })
        ).ok,
      ).toBe(true);
      const block = await call(page, "create_block", {
        sourceId: id,
        mode: "sample",
        title: `Example ${kind}`,
      });
      expect(block.data.outcome.visualization).toBe(kind);
      blocks[kind] = block.data.id;
      await expect(
        page.locator(`[data-widget-id="${block.data.id}"] .scenario-${kind}`),
      ).toBeVisible();
    }
    const sport = page.locator(`[data-widget-id="${blocks["sports-score"]}"]`);
    await expect(sport.locator(".scoreboard")).toContainText(
      "Baltimore Orioles",
    );
    await expect(sport.getByText("Game Pk", { exact: true })).not.toBeVisible();
    await call(page, "choose_visualization", {
      blockId: blocks.places,
      presentation: { type: "map" },
    });
    const place = page.locator(`[data-widget-id="${blocks.places}"]`);
    await expect(
      place.getByRole("link", { name: "Find address" }),
    ).toBeVisible();
    await expect(place.getByText(/No location was guessed/)).toBeVisible();

    const failed = await call(page, "create_block", {
      sourceId: "custom-test-news",
      mode: "live",
      title: "Retryable news",
    });
    expect(failed.isError).toBe(true);
    expect(failed.error.code).toBe("429");
    expect(failed.error.retryAfter).toBe(30);
    const failedCard = page.locator(`[data-widget-id="${failed.data.id}"]`);
    await expect(
      failedCard.getByText("Request limit reached", { exact: true }),
    ).toBeVisible();
    unavailable = false;
    await failedCard
      .getByRole("button", { name: "Retry request", exact: true })
      .click();
    await expect(failedCard.locator(".scenario-news")).toBeVisible();
    const derived = await call(page, "create_derived_block", {
      sourceIds: [blocks["sports-score"], blocks.places],
      title: "Game and address",
      presentation: { type: "record" },
      bindings: {
        title: { sourceId: blocks["sports-score"], path: "[0].home_team" },
        address: {
          sourceId: blocks.places,
          origin: "raw",
          path: "address.streetAddress",
        },
      },
    });
    expect(derived.ok).toBe(true);

    // Agent-created cards remain editable with normal controls.
    await sport
      .getByRole("button", { name: "Options for Example sports-score" })
      .click();
    await sport
      .getByRole("button", { name: "Change visualization", exact: true })
      .click();
    await sport
      .getByLabel("Visualization", { exact: true })
      .selectOption("sports-score");
    await sport.getByRole("button", { name: "Interface", exact: true }).click();
    await call(page, "collapse_sidebar", { collapsed: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const shared = await call(page, "open_share_view", {});
    const share = await context.newPage();
    await share.setViewportSize({ width, height: 1000 });
    await share.goto(shared.data.url);
    await expect(share.locator(".scoreboard")).toBeVisible();
    await expect(
      share.getByRole("button", { name: "Add public source", exact: true }),
    ).toHaveCount(0);
    await share.reload();
    await expect(
      share.getByText("Game and address", { exact: true }),
    ).toBeVisible();
    expect(
      await share.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.locator(".scoreboard")).toBeVisible();
    const restored = await call(page, "list_blocks", {});
    expect(restored.data.widgets).toHaveLength(9);
    expect(
      restored.data.widgets.find((w: any) => w.id === derived.data.id).bindings
        .address.path,
    ).toBe("address.streetAddress");
    expect(errors).toEqual([]);
  });
}
