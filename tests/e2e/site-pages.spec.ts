import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const registered = (page: Page) =>
  page.evaluate(() => [...(window as any).siteTools.keys()] as string[]);
const call = (page: Page, name: string, input: unknown) =>
  page.evaluate(
    async ({ name, input }) =>
      JSON.parse(
        (await (window as any).siteTools.get(name).execute(input)).content[0]
          .text,
      ),
    { name, input },
  );
for (const width of [320, 375, 768, 1024, 1440])
  test(`documentation and shared tool lifecycle at ${width}px`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const registry = new Map();
      (window as any).siteTools = registry;
      (window as any).registrationCalls = 0;
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: {
          registerTool(tool: any, options: any) {
            registry.set(tool.name, tool);
            (window as any).registrationCalls++;
            options?.signal?.addEventListener("abort", () =>
              registry.delete(tool.name),
            );
          },
        },
      });
    });
    await page.goto("/webmcp");
    await expect(
      page.getByRole("heading", { name: "One canvas. Two ways to work." }),
    ).toBeVisible();
    await expect(page.getByTestId("native-status")).toHaveText("available");
    const names = await registered(page);
    expect(names.length).toBeGreaterThan(30);
    expect(
      await page
        .locator("[data-tool]")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-tool"))),
    ).toEqual(names);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(page.getByText("Step 1 of 5", { exact: true })).toBeVisible();
    const workspace = page.locator('[data-tool="get_workspace"]');
    await workspace
      .getByRole("button", { name: "Run local read-only example" })
      .click();
    await expect(page.locator("#inspector pre")).toContainText("get_workspace");
    const before = await call(page, "get_workspace", {});
    await page
      .locator('[data-tool="delete_block"]')
      .getByRole("button", { name: "Preview action" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("never executes it");
    await page
      .getByRole("button", { name: "Close preview", exact: true })
      .click();
    expect((await call(page, "get_workspace", {})).revision).toBe(
      before.revision,
    );
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
    await workspace
      .getByRole("button", { name: "Copy tool name", exact: true })
      .click();
    await expect(workspace.getByRole("status")).toContainText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "get_workspace",
    );
    await page.getByLabel("Search tools").fill("resize_block");
    await expect(page.locator("[data-tool]")).toHaveCount(1);
    await page.getByLabel("Search tools").fill("");
    const newCard = await call(page, "create_block", {
      sourceId: "usgs",
      operationId: "recent",
      arguments: { limit: 3 },
      mode: "sample",
      title: "Documentation smoke sample",
      presentation: { type: "map" },
    });
    expect(newCard.ok).toBe(true);
    const blockId = newCard.data.id;
    await call(page, "choose_visualization", {
      blockId,
      presentation: { type: "table" },
    });
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Hackathon", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Public data. A shared canvas." }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/Hackathon demo/);
    await expect(page.locator(".video-placeholder")).toContainText(
      "[YOUTUBE_URL]",
    );
    await expect(page.locator(".video-frame iframe")).toHaveCount(0);
    expect(await registered(page)).toEqual(names);
    expect(await page.evaluate(() => (window as any).registrationCalls)).toBe(
      names.length,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const missingTargets = await page
      .locator('a[href^="#"]')
      .evaluateAll((nodes) =>
        nodes
          .map((n) => n.getAttribute("href")!.slice(1))
          .filter((id) => !document.getElementById(id)),
      );
    expect(missingTargets).toEqual([]);
    await page.screenshot({
      path: `artifacts/release/hackathon-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "Launch demo", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Add content", exact: true }),
    ).toBeVisible();
    await expect(page.locator(`[data-widget-id="${blockId}"]`)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await registered(page)).toEqual(names);
    await page
      .getByRole("navigation", { name: "Project navigation" })
      .getByRole("link", { name: "WebMCP", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "One canvas. Two ways to work." }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/release/webmcp-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
    await page.reload();
    await expect(page.getByTestId("native-status")).toHaveText("available");
    await expect
      .poll(async () =>
        (await call(page, "get_workspace", {})).widgets.some(
          (w: any) => w.id === blockId,
        ),
      )
      .toBe(true);
    await page.goto("/hackathon");
    await expect(
      page.getByRole("heading", { name: "Public data. A shared canvas." }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveTitle(/Hackathon demo/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://api-canvas-bclonan.netlify.app/hackathon",
    );
    expect(errors).toEqual([]);
  });
test("unavailable native API, route metadata and production assets", async ({
  page,
  request,
}) => {
  await page.goto("/webmcp");
  await expect(page.getByTestId("native-status")).toHaveText("unavailable");
  await expect(page.locator("#inspector")).toContainText(
    "Local execution does not demonstrate a native",
  );
  for (const path of [
    "/favicon.ico",
    "/favicon.svg",
    "/apple-touch-icon.png",
    "/og-image.png",
    "/site.webmanifest",
  ]) {
    const response = await request.get(path);
    expect(response.ok(), path).toBe(true);
    expect(
      Buffer.compare(await response.body(), readFileSync(`public${path}`)),
      path,
    ).toBe(0);
  }
  for (const path of ["/webmcp", "/hackathon"]) {
    const raw = await request.get(path);
    if (!new URL(raw.url()).hostname.startsWith("127.")) {
      const html = await raw.text();
      const expected =
        path === "/webmcp"
          ? "WebMCP tools and workflows"
          : "Hackathon demo and architecture";
      expect(html).toMatch(
        new RegExp(`property="og:title"\\s+content="${expected}`),
      );
      expect(html).toMatch(
        new RegExp(`name="twitter:title"\\s+content="${expected}`),
      );
    }
    await page.goto(path);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `https://api-canvas-bclonan.netlify.app${path}`,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  }
});
