import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function call(page: Page, name: string, input: unknown) {
  return page.evaluate(
    async ({ name, input }) => {
      const response = await (window as any).contentTools
        .get(name)
        .execute(input);
      return JSON.parse(response.content[0].text);
    },
    { name, input },
  );
}
const prices = {
  version: 1,
  kind: "dataset",
  title: "Illustrative stock prices",
  body: "Test fixture, not current market data.",
  records: [
    {
      date: "2026-09-01",
      symbol: "DEMO",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
      currency: "USD",
    },
    {
      date: "2026-09-02",
      symbol: "DEMO",
      open: 11,
      high: 14,
      low: 10,
      close: 13,
      volume: 200,
      currency: "USD",
    },
  ],
};

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`content, stock, media and cited answers persist at ${width}px`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const registry = new Map();
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: { registerTool: (tool: any) => registry.set(tool.name, tool) },
      });
      (window as any).contentTools = registry;
    });
    await page.route("https://www.youtube-nocookie.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>Controlled embed fixture</p>",
      }),
    );
    await page.route("https://media.example.org/**", (route) =>
      route.fulfill({ status: 404, body: "Unavailable test media" }),
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "Agent ready", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).contentTools.size)).toBe(
      37,
    );

    await page
      .getByRole("button", { name: "Add content", exact: true })
      .click();
    await page.getByLabel("Content title").fill("Research notes");
    await page
      .getByLabel("Content text")
      .fill("These are saved notes. <script>window.untrusted=true</script>");
    await page
      .getByRole("button", { name: "Save content", exact: true })
      .click();
    const notes = page.getByRole("article", {
      name: "Research notes",
      exact: true,
    });
    await expect(notes).toContainText("<script>window.untrusted=true</script>");
    expect(
      await page.evaluate(() => (window as any).untrusted),
    ).toBeUndefined();
    await notes.getByRole("button", { name: /^Options for/ }).click();
    await notes
      .getByRole("button", { name: "Edit content", exact: true })
      .click();
    await page
      .getByLabel("Content text")
      .fill(
        "Working notes. Review the supplied prices before drawing conclusions.",
      );
    await page
      .getByRole("button", { name: "Save content", exact: true })
      .click();

    const stock = await call(page, "create_content_block", {
      content: prices,
      key: "prices",
      presentation: { type: "stock-chart" },
    });
    expect(stock.ok).toBe(true);
    const chart = page.getByRole("article", {
      name: prices.title,
      exact: true,
    });
    await expect(
      chart.getByRole("img", { name: /2 supplied price observations/ }),
    ).toBeVisible();
    await chart.getByLabel("Price chart style").selectOption("line");
    await chart.getByRole("button", { name: /^Options for/ }).click();
    await chart
      .getByRole("button", { name: "Edit content", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save content", exact: true })
      .click();
    await expect(chart.getByLabel("Price chart style")).toHaveValue("line");
    await chart.getByText("Price data table", { exact: true }).click();
    await expect(chart.locator("tbody tr")).toHaveCount(2);
    const derived = await call(page, "create_derived_block", {
      sourceIds: [stock.data.id],
      title: "Supplied close",
      presentation: { type: "metric" },
      bindings: { value: { sourceId: stock.data.id, path: "[1].close" } },
    });
    expect(derived.ok).toBe(true);
    await expect(
      page.getByRole("article", { name: "Supplied close", exact: true }),
    ).toContainText("13");

    const embed = await call(page, "create_content_block", {
      content: {
        version: 1,
        kind: "embed",
        title: "Video embed",
        url: "https://youtu.be/jfKfPfyJRdk",
      },
    });
    expect(embed.data.outcome.issues.map((i: any) => i.code)).toContain(
      "embed_unverified",
    );
    const videoCard = page.getByRole("article", {
      name: "Video embed",
      exact: true,
    });
    await expect(videoCard.locator("iframe")).toHaveCount(0);
    await videoCard
      .getByRole("button", { name: "Load embed", exact: true })
      .click();
    await expect(videoCard.locator("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk",
    );
    await expect(videoCard.locator("iframe")).toHaveAttribute(
      "sandbox",
      /allow-scripts/,
    );
    const broken = await call(page, "create_content_block", {
      content: {
        version: 1,
        kind: "embed",
        title: "Unavailable test video",
        url: "https://media.example.org/missing.webm",
      },
    });
    const brokenCard = page.getByRole("article", {
      name: "Unavailable test video",
      exact: true,
    });
    await expect(brokenCard.getByRole("alert")).toContainText(
      "Playback is unavailable",
    );
    const listing = await call(page, "list_blocks", {});
    expect(
      listing.data.widgets
        .find((w: any) => w.id === broken.data.id)
        .outcome.issues.map((i: any) => i.code),
    ).toContain("playback");
    await brokenCard.getByRole("button", { name: "Retry player" }).click();
    await expect(brokenCard.getByRole("alert")).toBeVisible();

    const file = await call(page, "create_content_block", {
      content: {
        version: 1,
        kind: "file",
        title: "Research export",
        file: {
          name: "research.md",
          format: "md",
          text: "# Supplied values\nTwo illustrative observations.",
        },
        sourceIds: [stock.data.id],
      },
    });
    expect(file.ok).toBe(true);
    const downloading = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download research.md", exact: true })
      .click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("research.md");
    expect(await readFile((await download.path())!, "utf8")).toContain(
      "Two illustrative observations",
    );

    await chart.getByRole("button", { name: /^Options for/ }).click();
    await chart
      .getByRole("button", { name: "Ask about this card", exact: true })
      .click();
    await page
      .getByLabel("Question about canvas")
      .fill("What is the latest supplied close?");
    await page
      .getByRole("button", { name: "Save question for agent", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText(
      "Question saved",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Close/ })
      .click();
    const blocks = await call(page, "list_blocks", {});
    const question = blocks.data.widgets.find(
      (w: any) => w.title === "What is the latest supplied close?",
    );
    expect(question.outcome.issues.map((i: any) => i.code)).toContain(
      "awaiting_answer",
    );
    const evidence = await call(page, "prepare_canvas_question", {
      question: "What is the latest supplied close?",
      blockIds: [stock.data.id],
    });
    expect(evidence.data.context.blocks).toHaveLength(1);
    expect(evidence.data.context.blocks[0].data[1].close).toBe(13);
    const answer = await call(page, "update_content_block", {
      blockId: question.id,
      expectedRevision: evidence.data.context.revision,
      content: {
        version: 1,
        kind: "answer",
        title: "Supplied price answer",
        body: "The latest supplied close is 13 USD on September 2, 2026. This is illustrative data, not a live quote.",
        question: "What is the latest supplied close?",
        sourceIds: [stock.data.id],
        citations: [
          {
            blockId: stock.data.id,
            path: "[1].close",
            origin: "data",
            label: "Supplied price row",
          },
        ],
      },
    });
    expect(answer.ok).toBe(true);
    expect(answer.data.id).toBe(question.id);
    await expect(
      page.getByRole("article", { name: "Supplied price answer", exact: true }),
    ).toContainText("13 USD");
    const changed = await call(page, "update_content_block", {
      blockId: stock.data.id,
      content: {
        ...prices,
        records: [prices.records[0], { ...prices.records[1], close: 14 }],
      },
    });
    expect(changed.ok).toBe(true);
    await expect(
      page.getByRole("article", { name: "Supplied close", exact: true }),
    ).toContainText("14");
    await expect(
      page.getByRole("article", { name: "Supplied price answer", exact: true }),
    ).toContainText("changed since this content was written");
    expect(
      (await call(page, "summarize_canvas", { blockIds: [stock.data.id] })).ok,
    ).toBe(true);
    const reorder = page.getByRole("button", {
      name: "Reorder Research notes",
      exact: true,
    });
    await reorder.focus();
    await reorder.press("End");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".workspace-grid > .widget").last(),
    ).toHaveAttribute("aria-label", "Research notes");
    // The chart is code-split. Allow its module to load after a full reload.
    await expect(chart.getByLabel("Price chart style")).toHaveValue("line", {
      timeout: 25000,
    });
    await expect(
      videoCard.getByRole("button", { name: "Load embed", exact: true }),
    ).toBeVisible();
    await call(page, "collapse_sidebar", { collapsed: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    if ([375, 1440].includes(width))
      await page.screenshot({
        path: `artifacts/release/content-editor-${width}.png`,
        fullPage: false,
      });
    const shared = await call(page, "open_share_view", {});
    expect(shared.ok).toBe(true);
    const share = await context.newPage();
    await share.setViewportSize({ width, height: 1000 });
    await share.goto(shared.data.url, { waitUntil: "domcontentloaded" });
    await expect(
      share.getByRole("main", { name: "Shared workspace" }),
    ).toBeVisible();
    await expect(share.locator(".share-card")).toHaveCount(8);
    await expect(
      share.getByRole("article", { name: "Supplied close", exact: true }),
    ).toContainText("Connected source snapshot");
    await expect(
      share.getByRole("article", {
        name: "Supplied price answer",
        exact: true,
      }),
    ).toContainText("changed since this content was written");
    await expect(share.getByLabel("Price chart style")).toHaveValue("line");
    await expect(
      share.getByRole("button", { name: "Add content", exact: true }),
    ).toHaveCount(0);
    expect(
      await share.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await share.evaluate(() => window.scrollTo(0, 0));
    if ([375, 1440].includes(width))
      await share.screenshot({
        path: `artifacts/release/content-share-${width}.png`,
        fullPage: false,
      });
  });
}
