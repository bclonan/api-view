import { test, expect } from "@playwright/test";
import { firstWave } from "../../src/api/providers/public-data";
import { morePublicData } from "../../src/api/providers/more-public-data";
const goal =
  "Build me an earthquake research dashboard. Map magnitude 5+ earthquakes from the past week, find recent research about earthquakes, identify the largest earthquake and add its local weather. Pick appropriate views and arrange everything clearly.";
test("reviews the flagship goal, composes three responses, and edits views without requests", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Workspace command", { exact: true }).fill(goal);
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Request plan" }),
  ).toContainText("Magnitude 5 and 7 days");
  await expect(page.locator("[data-widget-id]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Run this plan", exact: true })
    .click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(3);
  await expect(
    page.getByRole("article", {
      name: "Weather near the strongest event",
      exact: true,
    }),
  ).toContainText("°C");
  let requests = 0;
  page.on("request", (request) => {
    if (/earthquake.usgs|api.crossref|api.open-meteo/.test(request.url()))
      requests++;
  });
  await page
    .getByLabel("Workspace command", { exact: true })
    .fill(
      "Duplicate the earthquake data as a histogram, make the papers a table showing only title, authors, publication year and DOI, and move the weather beside the map.",
    );
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await page
    .getByRole("button", { name: "Run this plan", exact: true })
    .click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(4);
  const papers = page.getByRole("article", {
    name: "earthquakes research",
    exact: true,
  });
  await expect(papers.getByRole("columnheader")).toHaveCount(4);
  await expect(
    page.getByRole("article", {
      name: "Earthquake observations copy",
      exact: true,
    }),
  ).toContainText("Count");
  expect(requests).toBe(0);
  await page.reload();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(4);
  await expect(papers.getByRole("columnheader")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Request history", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".history-entry")).toHaveCount(
    3,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  expect(errors).toEqual([]);
});
test("has all first-wave request forms and source-independent views", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("38 sources", { exact: true })).toBeVisible();
  for (const name of [
    "Art Institute of Chicago Art",
    "Crossref Research",
    "PubChem Chemistry",
    "ClinicalTrials.gov Health",
    "Data USA Population",
    "Frankfurter Finance",
    "Open Brewery DB Places",
    "Nager.Date Events",
    "Hacker News Developer",
    "Library of Congress History",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByLabel("Visualization", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add to workspace", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "Nager.Date Events", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to workspace", exact: true })
    .click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(1);
});
test("keeps a narrow request plan usable and does not guess missing places", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page
    .getByLabel("Workspace command", { exact: true })
    .fill("Show the weather");
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Request plan" }),
  ).toContainText("Which location");
  await expect(
    page.getByRole("button", { name: "Run this plan", exact: true }),
  ).toBeDisabled();
  expect(
    await page
      .locator("html")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("renders all eighteen added provider fixtures through generic components", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: /Agent tools|Agent ready/, exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Agent tools", exact: true });
  await modal
    .getByRole("button", { name: "create_dashboard Edit", exact: true })
    .click();
  const sources = [...firstWave, ...morePublicData];
  for (let index = 0; index < sources.length; index += 12) {
    await modal.getByLabel("Tool arguments").fill(
      JSON.stringify({
        widgets: sources.slice(index, index + 12).map((api) => ({
          apiId: api.id,
          operationId: api.operations[0].id,
          arguments: api.operations[0].capability?.examples[0]?.arguments ?? {},
          mode: "sample",
        })),
      }),
    );
    await modal
      .getByRole("button", { name: "Run locally", exact: true })
      .click();
    await expect(page.locator('[data-status="ready"]')).toHaveCount(
      Math.min(index + 12, sources.length),
    );
  }
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(page.locator('[data-status="error"]')).toHaveCount(0);
  await expect(
    page.getByRole("article").filter({ hasText: "This response has no" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("keeps a failed planned request in a card and retries only that request", async ({
  page,
}) => {
  let calls = 0;
  const artwork = firstWave.find((api) => api.id === "artic")!.operations[0];
  await page.route("https://api.artic.edu/**", (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? { status: 503, contentType: "application/json", body: "{}" }
        : {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(artwork.sample({ q: "Monet" })),
          },
    );
  });
  await page.goto("/");
  await page
    .getByRole("combobox", {
      name: "Default data mode for new widgets",
      exact: true,
    })
    .selectOption("live");
  await page
    .getByLabel("Workspace command", { exact: true })
    .fill("Find Monet paintings");
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await page
    .getByRole("button", { name: "Run this plan", exact: true })
    .click();
  const card = page.getByRole("article", {
    name: "Monet artworks",
    exact: true,
  });
  await expect(card).toHaveAttribute("data-status", "error");
  await expect(card).toContainText("HTTP 503");
  await card
    .getByRole("button", { name: "Retry request", exact: true })
    .click();
  await expect(card).toHaveAttribute("data-status", "ready");
  await expect(page.locator("[data-widget-id]")).toHaveCount(1);
  expect(calls).toBe(2);
});
