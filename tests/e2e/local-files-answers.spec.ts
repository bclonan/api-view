import { test, expect, type Page } from "@playwright/test";
const call = (page: Page, name: string, input: unknown) =>
  page.evaluate(
    async ({ name, input }) =>
      JSON.parse(
        (await (window as any).fileAnswerTools.get(name).execute(input))
          .content[0].text,
      ),
    { name, input },
  );
for (const width of [320, 375, 768, 1024, 1440])
  test(`local attachments, styles and question answers at ${width}px`, async ({
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
      (window as any).fileAnswerTools = registry;
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "Agent ready", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add content", exact: true })
      .click();
    await page.getByLabel("Content type", { exact: true }).selectOption("file");
    await page
      .getByLabel("Content title", { exact: true })
      .fill("Local research files");
    await page.getByLabel("Choose local files", { exact: true }).setInputFiles([
      {
        name: "counts.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          '[{"name":"Apricot","count":2},{"name":"Plum","count":4}]',
        ),
      },
      {
        name: "pixel.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
          "base64",
        ),
      },
    ]);
    await expect(page.getByRole("dialog")).toContainText(
      "counts.json · snapshot",
    );
    await page.getByText("Custom style", { exact: true }).click();
    await page.getByLabel("Card text size").fill("18");
    await page
      .getByLabel("Card background")
      .evaluate((node: HTMLInputElement) => {
        node.value = "#fff4dd";
        node.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await page
      .getByRole("button", { name: "Save content", exact: true })
      .click();
    const local = page.getByRole("article", {
      name: "Local research files",
      exact: true,
    });
    await expect(local.getByRole("img", { name: "pixel.png" })).toBeVisible();
    await expect(local).toContainText("Apricot");
    await expect(local).toHaveCSS("background-color", "rgb(255, 244, 221)");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(local.getByRole("img", { name: "pixel.png" })).toBeVisible();
    await expect(local).toContainText("Apricot");
    const source = await call(page, "create_content_block", {
      content: {
        version: 1,
        kind: "dataset",
        title: "Supplied targets",
        records: [
          { name: "Apricot", target: 3 },
          { name: "Plum", target: 3 },
        ],
      },
      presentation: { type: "table" },
    });
    expect(source.ok).toBe(true);
    await page
      .getByRole("button", { name: "Ask about data", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Select all cards", exact: true })
      .click();
    await page
      .getByLabel("Question about canvas")
      .fill("Which fruit is above its target?");
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
    const listing = await call(page, "list_blocks", {});
    const question = listing.data.widgets.find(
      (w: any) => w.content?.kind === "question",
    );
    const localId = listing.data.widgets.find(
      (w: any) => w.title === "Local research files",
    ).id;
    const prepared = await call(page, "prepare_canvas_question", {
      questionBlockId: question.id,
    });
    expect(prepared.data.scope).toEqual([localId, source.data.id]);
    expect(
      prepared.data.context.blocks.find((w: any) => w.id === localId).content
        .files[0].data[1].count,
    ).toBe(4);
    const outputs = [
      {
        content: {
          version: 1,
          kind: "answer",
          title: "Fruit comparison",
          body: "Plum has a supplied count of 4 against a target of 3. Apricot is below its target.",
          citations: [
            {
              blockId: localId,
              path: "files[0].data[1].count",
              origin: "raw",
              label: "Saved local counts",
            },
            {
              blockId: source.data.id,
              path: "[1].target",
              origin: "data",
              label: "Supplied targets",
            },
          ],
        },
      },
      {
        content: {
          version: 1,
          kind: "dataset",
          title: "Comparison table",
          records: [{ name: "Plum", count: 4, target: 3 }],
        },
        presentation: { type: "table" },
      },
    ];
    const answer = await call(page, "answer_canvas_question", {
      questionBlockId: question.id,
      expectedRevision: prepared.data.context.revision,
      outputs,
    });
    expect(answer.ok, JSON.stringify(answer)).toBe(true);
    const answerCard = page.getByRole("article", {
      name: "Fruit comparison",
      exact: true,
    });
    await expect(answerCard).toContainText("count of 4");
    const questionCard = page.getByRole("article", {
      name: "Which fruit is above its target?",
      exact: true,
    });
    await expect(questionCard).toContainText("2 answer blocks");
    await questionCard
      .getByRole("button", { name: "Open question and answers", exact: true })
      .click();
    await page
      .getByLabel("Write an answer")
      .fill("Review the source counts before using this comparison.");
    await page
      .getByRole("button", { name: "Add answer block", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "3 answer blocks on this page",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Close/ })
      .click();
    await answerCard.getByRole("button", { name: /^Options for/ }).click();
    await answerCard
      .getByRole("button", { name: "Edit content", exact: true })
      .click();
    await page
      .getByLabel("Content title", { exact: true })
      .fill("Reviewed fruit comparison");
    await page
      .getByRole("button", { name: "Save content", exact: true })
      .click();
    const moved = await call(page, "move_block", {
      blockId: answer.data.blocks[0].id,
      position: 0,
    });
    expect(moved.ok).toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".workspace-grid > .widget").first(),
    ).toHaveAttribute("aria-label", "Reviewed fruit comparison");
    await expect(questionCard).toContainText("3 answer blocks");
    await call(page, "collapse_sidebar", { collapsed: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    if ([375, 1440].includes(width))
      await page.screenshot({
        path: `artifacts/release/files-answers-editor-${width}.png`,
      });
    const shared = await call(page, "open_share_view", {});
    const share = await context.newPage();
    await share.emulateMedia({ reducedMotion: "reduce" });
    await share.setViewportSize({ width, height: 1000 });
    await share.goto(shared.data.url, { waitUntil: "domcontentloaded" });
    const shareLocal = share.getByRole("article", {
      name: "Local research files",
      exact: true,
    });
    await expect(shareLocal).toContainText("Local files are not included");
    await expect(
      shareLocal.getByRole("img", { name: "pixel.png" }),
    ).toHaveCount(0);
    await expect(
      share.getByRole("button", { name: "Add content", exact: true }),
    ).toHaveCount(0);
    expect(
      await share.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    if ([375, 1440].includes(width))
      await share.screenshot({
        path: `artifacts/release/files-answers-share-${width}.png`,
      });
    await share.close();
    await page
      .getByRole("dialog", { name: "Share this workspace" })
      .getByRole("button", { name: /Close/ })
      .click();
    const missing = await call(page, "create_content_block", {
      content: {
        version: 1,
        kind: "file",
        title: "Reconnect local reference",
        files: [
          {
            id: "local-missing-test",
            name: "notes.txt",
            access: "reference",
            uri: "file:///private/notes.txt",
          },
        ],
      },
    });
    expect(missing.ok).toBe(true);
    const missingCard = page.getByRole("article", {
      name: "Reconnect local reference",
      exact: true,
    });
    await expect(missingCard).toContainText("Local file unavailable");
    await missingCard.getByRole("button", { name: /^Options for/ }).click();
    await missingCard
      .getByRole("button", { name: "Edit content", exact: true })
      .click();
    await page.getByLabel("Reconnect notes.txt").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Reconnected content"),
    });
    await expect(page.getByRole("dialog")).toContainText(
      "notes.txt · snapshot",
    );
    await page
      .getByRole("button", { name: "Save content", exact: true })
      .click();
    await expect(missingCard).toContainText("Reconnected content");
  });
