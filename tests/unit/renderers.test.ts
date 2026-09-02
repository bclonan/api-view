import { describe, expect, it } from "vitest";
import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import BlockRenderer from "../../src/blocks/BlockRenderer.vue";
import ValueRenderer from "../../src/values/ValueRenderer.vue";
import { normalize } from "../../src/runtime/normalize";
import type { Operation, PresentationType } from "../../src/types";
const render = (data: unknown, type: PresentationType) =>
  renderToString(
    createSSRApp(BlockRenderer, {
      result: normalize(
        data,
        { id: "generic", extract: (r) => r } as Operation,
        "test",
        "sample",
      ),
      presentation: { type },
    }),
  );
describe("generic renderers", () => {
  it("renders numeric values as text without losing the value", async () =>
    expect(await render(12345, "text")).toContain("12,345"));
  it("renders single image and audio/video as native elements", async () => {
    expect(
      await render({ image_url: "https://example.com/photo.jpg" }, "image"),
    ).toContain("<img");
    expect(
      await render({ audio: "https://example.com/clip.mp3" }, "media"),
    ).toContain("<audio");
    expect(
      await render({ video: "https://example.com/clip.mp4" }, "media"),
    ).toContain("<video");
  });
  it("keeps all fields in key-value mode", async () => {
    const html = await render(
      {
        title: "Sample title",
        description: "Sample description",
        available: true,
      },
      "key-value",
    );
    expect(html).toContain("Sample title");
    expect(html).toContain("Sample description");
    expect(html).toContain("Yes");
  });
  it("escapes remote HTML and refuses executable URLs", async () => {
    const html = await render(
      { title: "<script>alert(1)</script>", url: "javascript:alert(1)" },
      "record",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    const malformed = await renderToString(
      createSSRApp(ValueRenderer, { value: "https://", semanticType: "url" }),
    );
    expect(malformed).not.toContain("<a");
  });
  it("shows an empty state for absent data", async () =>
    expect(await render([], "table")).toContain("No results this time"));
  it("shows a fallback for incompatible chart data", async () =>
    expect(await render([{ name: "Only text" }], "line-chart")).toContain(
      "This data does not fit the selected view",
    ));
});
