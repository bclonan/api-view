import { expect, test } from "@playwright/test";

test("the mixed-source starter binds four APIs into a generic summary", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: /FOUR SOURCES, ONE VIEW Public data dashboard/,
    })
    .click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  const summary = page.getByRole("article", {
    name: "Across the sources",
    exact: true,
  });
  await expect(summary).toContainText("4 sources");
  await expect(summary).toContainText("6,177,224");
  await expect(summary).toContainText("Earth from space");
  await expect(summary).toContainText("Sample drug label");
  const quake = page.getByRole("article", {
    name: "Earthquake observations",
    exact: true,
  });
  await expect(quake.getByRole("columnheader")).toHaveCount(3);
  await summary
    .getByRole("button", { name: "Options for Across the sources" })
    .click();
  await summary
    .getByRole("button", { name: "Move to top", exact: true })
    .click();
  await expect(page.locator("article.widget").first()).toHaveAttribute(
    "aria-label",
    "Across the sources",
  );
  await summary.getByRole("button", { name: "record", exact: true }).click();
  await summary
    .getByLabel("Visualization", { exact: true })
    .selectOption("metric");
  await summary.getByRole("button", { name: "Interface", exact: true }).click();
  await expect(summary.locator(".metric-value")).toHaveText("6.18M");
  await page.reload();
  await expect(summary.locator(".metric-value")).toHaveText("6.18M");
  await expect(summary).toContainText("4 sources");
});

test("keeps dashboards separate through switch, reload, clear, undo and delete", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /GOVERNMENT & EARTH The U.S. at a glance/ })
    .click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  await page
    .getByRole("button", { name: "New dashboard", exact: true })
    .click();
  await page
    .getByLabel("Dashboard name", { exact: true })
    .fill("My second dashboard");
  await page
    .getByRole("button", { name: "Create dashboard", exact: true })
    .click();
  await expect(page.locator("article.widget")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Switch dashboard" })
    .selectOption({ label: "The U.S. at a glance" });
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  await page
    .getByRole("button", { name: "Clear dashboard", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("article.widget")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Clear dashboard", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear all widgets", exact: true })
    .click();
  await expect(page.locator("article.widget")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo clear", exact: true }).click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  await page
    .getByRole("combobox", { name: "Switch dashboard" })
    .selectOption({ label: "My second dashboard" });
  await page
    .getByRole("button", { name: "Manage dashboard", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete dashboard", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete this dashboard", exact: true })
    .click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  await expect(
    page.getByRole("combobox", { name: "Switch dashboard" }).locator("option"),
  ).toHaveCount(1);
});

test("uses a custom nested response in the existing request, bindings and renderer UI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add API or local data", exact: true })
    .click();
  await page.getByLabel("API name", { exact: true }).fill("County data");
  await page.getByLabel("Sample response JSON").fill(
    JSON.stringify({
      records: [
        {
          name: "Maryland",
          population: 6177224,
          properties: { magnitude: 4.6 },
        },
      ],
    }),
  );
  await page.getByRole("button", { name: "Save API", exact: true }).click();
  await page
    .getByRole("button", { name: "Add to workspace", exact: true })
    .click();
  const widget = page.getByRole("article", {
    name: "County data",
    exact: true,
  });
  await expect(widget).toHaveAttribute("data-status", "ready");
  await widget.getByRole("button", { name: "Options for County data" }).click();
  await widget
    .getByRole("button", { name: "Show fields", exact: true })
    .click();
  await expect(
    widget.getByText("records[].properties.magnitude", { exact: true }),
  ).toBeVisible();
  await widget.getByRole("button", { name: "Options for County data" }).click();
  await widget
    .getByRole("button", { name: "Change visualization", exact: true })
    .click();
  await widget.getByLabel("Binding origin").selectOption("raw");
  await widget.getByLabel("Binding path").fill("records[0].population");
  await widget.getByLabel("Binding label").fill("Population");
  await widget
    .getByRole("button", { name: "Add or replace binding", exact: true })
    .click();
  await widget
    .getByRole("button", { name: "Apply data settings", exact: true })
    .click();
  await widget
    .getByLabel("Visualization", { exact: true })
    .selectOption("metric");
  await widget.getByRole("button", { name: "Interface", exact: true }).click();
  await expect(widget.locator(".metric-value")).toHaveText("6.18M");
  await page.reload();
  await expect(widget.locator(".metric-value")).toHaveText("6.18M");
  await widget.getByRole("button", { name: "Options for County data" }).click();
  await widget
    .getByRole("button", { name: "Show response", exact: true })
    .click();
  await expect(
    widget.getByText("records Array · 1", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("builds, transforms, inspects, exports, and restores a dashboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: /GOVERNMENT & EARTH The U.S. at a glance/ })
    .click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  const widget = page.getByRole("article", {
    name: "Federal debt over time",
    exact: true,
  });
  await widget.getByRole("button", { name: "line chart", exact: true }).click();
  await widget
    .getByLabel("Visualization", { exact: true })
    .selectOption("table");
  await widget.getByRole("button", { name: "Interface", exact: true }).click();
  await expect(widget.getByRole("table")).toBeVisible();
  await widget.getByRole("button", { name: "Date" }).click();
  await expect(
    widget.getByRole("columnheader", { name: /Date/ }),
  ).toHaveAttribute("aria-sort", "ascending");
  await widget.getByRole("button", { name: "Next page" }).click();
  await expect(widget.getByText("2 / 3")).toBeVisible();
  await widget.getByRole("button", { name: "Request", exact: true }).click();
  await expect(
    widget.getByText("Sample fixture. This URL was not requested.", {
      exact: false,
    }),
  ).toBeVisible();
  await widget.getByRole("button", { name: "Code", exact: true }).click();
  await expect(widget.locator("pre")).toContainText("await fetch(");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toBe(
    "api-canvas-workspace.json",
  );
  await page.reload();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  await expect(
    page
      .getByRole("article", { name: "Federal debt over time", exact: true })
      .getByRole("table"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("completes missing inputs manually, then duplicates and removes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open-Meteo Weather", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to workspace", exact: true })
    .click();
  const widget = page.getByRole("article", {
    name: "Local weather",
    exact: true,
  });
  await expect(widget).toHaveAttribute("data-status", "needs-input");
  await widget.getByLabel("Latitude").fill("39.29");
  await widget.getByLabel("Longitude").fill("-76.61");
  await widget.getByRole("button", { name: "Load widget" }).click();
  await expect(widget).toHaveAttribute("data-status", "ready");
  await widget
    .getByRole("button", { name: "Options for Local weather", exact: true })
    .click();
  await widget.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator("article.widget")).toHaveCount(2);
  const copy = page.getByRole("article", {
    name: "Local weather copy",
    exact: true,
  });
  await copy
    .getByRole("button", { name: "Options for Local weather copy" })
    .click();
  await copy.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("article.widget")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Confirm remove block", exact: true })
    .click();
  await expect(page.locator("article.widget")).toHaveCount(1);
});

test("local tool runner rejects invalid inputs and creates a pending widget", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Agent tools|Agent ready/, exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Agent tools", exact: true });
  await modal
    .getByRole("button", { name: "create_widget Edit", exact: true })
    .click();
  await modal.getByLabel("Tool arguments").fill(
    JSON.stringify({
      apiId: "open-meteo",
      operationId: "forecast",
      arguments: { latitude: 1000, longitude: 0 },
    }),
  );
  await modal.getByRole("button", { name: "Run locally", exact: true }).click();
  await expect(modal.getByLabel("Tool result")).toContainText("between");
  await modal.getByLabel("Tool arguments").fill(
    JSON.stringify({
      apiId: "open-meteo",
      operationId: "forecast",
      arguments: {},
    }),
  );
  await modal.getByRole("button", { name: "Run locally", exact: true }).click();
  await expect(modal.getByLabel("Tool result")).toContainText("needs-input");
  await modal.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator('[data-status="needs-input"]')).toHaveCount(1);
});

test("a failed live request stays an error until the user selects samples", async ({
  page,
}) => {
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "retry-after": "37" },
      body: "{}",
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open-Meteo Weather", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Local weather" });
  await modal.getByLabel("Data source", { exact: true }).selectOption("live");
  await modal.getByLabel("Latitude").fill("38.9");
  await modal.getByLabel("Longitude").fill("-77.04");
  await modal.getByRole("button", { name: "Add to workspace" }).click();
  const widget = page.getByRole("article", {
    name: "Local weather",
    exact: true,
  });
  await expect(widget).toHaveAttribute("data-status", "error");
  await expect(widget.getByText("Request limit reached")).toBeVisible();
  await widget.getByRole("button", { name: "Use sample data" }).click();
  await expect(widget).toHaveAttribute("data-status", "ready");
  await expect(widget.getByText("Illustrative sample")).toBeVisible();
});

test("renders every source fixture and keeps raw response inspectable", async ({
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
  const sources = [
    ["treasury", "debt-to-penny", {}],
    ["open-meteo", "forecast", { latitude: 0, longitude: 0 }],
    ["usgs", "recent", {}],
    ["open-library", "search", { q: "cities" }],
    ["open-fda", "labels", { q: "aspirin" }],
    ["wikipedia", "summary", { title: "Baltimore" }],
    ["geocoding", "search", { name: "Baltimore" }],
    ["nasa", "search", {}],
    ["census", "population", {}],
    ["github", "repositories", {}],
    ["pokeapi", "pokemon", {}],
    ["picsum", "images", {}],
  ];
  await modal.getByLabel("Tool arguments").fill(
    JSON.stringify({
      widgets: sources.map(([apiId, operationId, args]) => ({
        apiId,
        operationId,
        arguments: args,
        mode: "sample",
      })),
    }),
  );
  await modal.getByRole("button", { name: "Run locally", exact: true }).click();
  await expect(modal.getByLabel("Tool result")).toContainText("ready");
  await modal.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(12);
  const drug = page.getByRole("article", { name: "Drug labels", exact: true });
  await drug.getByRole("button", { name: "Options for Drug labels" }).click();
  await drug.getByRole("button", { name: "Show response" }).click();
  await expect(drug.getByText("Response Object · 1")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile discovery, dialogs, and widgets fit a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open discovery" }).click();
  await expect(
    page.getByRole("heading", { name: "Discover", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close discovery" }).click();
  await page
    .getByRole("button", { name: /GOVERNMENT & EARTH The U.S. at a glance/ })
    .click();
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: /Agent tools|Agent ready/, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
