import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

async function call(page: Page, name: string, input: unknown) {
  return page.evaluate(
    async ({ name, input }) => {
      const response = await (window as any).releaseTools
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

test("real sports and location sources expose truthful outcomes in editor and share", async ({
  page,
  context,
}) => {
  // This check never substitutes fixture responses for failed public requests.
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
  expect(await page.evaluate(() => (window as any).releaseTools.size)).toBe(37);
  await page
    .getByLabel("Workspace title", { exact: true })
    .fill("Baltimore sports and places");
  await page.getByLabel("Workspace title", { exact: true }).press("Tab");
  const definitions = [
    {
      id: "custom-release-orioles",
      name: "MLB Orioles schedule",
      baseUrl: "https://statsapi.mlb.com",
      endpoint: "/api/v1/schedule",
      query: { sportId: "1", teamId: "110", date: "2026-09-02" },
    },
    {
      id: "custom-release-baltimore",
      name: "Baltimore location",
      baseUrl: "https://geocoding-api.open-meteo.com",
      endpoint: "/v1/search",
      query: {
        name: "Baltimore",
        countryCode: "US",
        count: "1",
        language: "en",
        format: "json",
      },
    },
    {
      id: "custom-release-ravens",
      name: "ESPN Ravens team",
      baseUrl: "https://site.api.espn.com",
      endpoint: "/apis/site/v2/sports/football/nfl/teams/bal",
    },
  ];
  const ids: string[] = [];
  for (const definition of definitions) {
    expect(
      (
        await call(page, "add_source", {
          definition: {
            ...definition,
            method: "GET",
            sampleResponse: [],
            attribution: definition.name,
          },
        })
      ).ok,
    ).toBe(true);
    const created = await call(page, "create_block", {
      sourceId: definition.id,
      title: definition.name,
      mode: "live",
      width: 6,
      waitForData: false,
    });
    expect(created.data.id).toBeTruthy();
    ids.push(created.data.id);
  }
  await expect
    .poll(
      async () =>
        (await call(page, "list_blocks", {})).data.availability.pendingBlockIds
          .length,
      { timeout: 30000 },
    )
    .toBe(0);
  const outcomes = (await call(page, "list_blocks", {})).data;
  await mkdir("artifacts/release", { recursive: true });
  await writeFile(
    "artifacts/release/scenarios-live-outcomes.json",
    JSON.stringify(outcomes, null, 2),
  );
  const mlb = outcomes.widgets.find((w: any) => w.id === ids[0]);
  expect(mlb.outcome.status, JSON.stringify(mlb.error)).toBe("ready");
  expect(mlb.outcome.visualization).toBe("sports-score");
  const location = outcomes.widgets.find((w: any) => w.id === ids[1]);
  expect(location.outcome.status, JSON.stringify(location.error)).toBe("ready");
  expect(location.outcome.visualization).toBe("map");
  const ravens = outcomes.widgets.find((w: any) => w.id === ids[2]);
  if (ravens.status === "error") {
    expect(ravens.outcome.issues[0].recovery).toBeTruthy();
    await expect(
      page.locator(`[data-widget-id="${ids[2]}"]`).getByRole("alert"),
    ).toBeVisible();
  } else expect(ravens.outcome.visualization).toBe("sports-team");
  const derived = await call(page, "create_derived_block", {
    sourceIds: ids.slice(0, 2),
    title: "Game and city context",
    presentation: { type: "record" },
    width: 6,
    bindings: {
      title: { sourceId: ids[0], path: "[0].away_team" },
      venue: { sourceId: ids[0], path: "[0].venue.name" },
      city: { sourceId: ids[1], path: "[0].name" },
    },
  });
  expect(derived.ok).toBe(true);
  await call(page, "collapse_sidebar", { collapsed: true });
  const editor = await call(page, "get_page_context", {});
  expect(
    editor.data.blocks.find((b: any) => b.id === ids[0]).rawData.dates,
  ).toBeTruthy();
  const shared = await call(page, "open_share_view", {});
  const share = await context.newPage();
  await share.goto(shared.data.url);
  await expect(share.locator(".scoreboard")).toBeVisible();
  await expect(
    share.getByRole("button", { name: "Add public source" }),
  ).toHaveCount(0);
  await page.getByRole("dialog", { name: "Share this workspace" }).getByRole("button", { name: /Close/ }).click();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1100 });
    await share.setViewportSize({ width, height: 1100 });
    await page.screenshot({
      path: `artifacts/release/scenarios-editor-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await share.screenshot({
      path: `artifacts/release/scenarios-share-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      await share.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await share.reload();
  await expect(share.locator(".scoreboard")).toBeVisible();
});
