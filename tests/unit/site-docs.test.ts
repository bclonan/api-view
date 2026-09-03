import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { nativeContracts } from "../../src/webmcp/register";
import { toolDocs, workflows, safeDocTools } from "../../src/site/toolDocs";
import {
  pageMetadata,
  youtubeEmbed,
  routeFor,
} from "../../src/site/navigation";
import {
  latestToolResult,
  recordToolResult,
} from "../../src/webmcp/inspection";
import script from "../../src/site/videoScript.json";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import DemoVideo from "../../src/site/DemoVideo.vue";
import { getOperation } from "../../src/api/registry";
describe("project documentation contracts", () => {
  it("documents exactly the native registry with valid JSON Schema examples", () => {
    expect(toolDocs.map((t) => t.name)).toEqual(
      nativeContracts.map((t) => t.name),
    );
    const ajv = new Ajv({
      strict: false,
      allErrors: true,
      allowUnionTypes: true,
    });
    for (const doc of toolDocs) {
      const valid = ajv.compile(doc.schema);
      expect(
        valid(doc.args),
        `${doc.name}: ${ajv.errorsText(valid.errors)}`,
      ).toBe(true);
      expect(doc.prompt.length).toBeGreaterThan(30);
      expect(doc.recovery.length).toBeGreaterThan(30);
      if (doc.outputSchema)
        expect(ajv.compile(doc.outputSchema)(doc.result), doc.name).toBe(true);
    }
  });
  it("chains use native tool names and describe state, approval and failure", () => {
    expect(workflows.length).toBeGreaterThanOrEqual(5);
    for (const workflow of workflows) {
      for (const step of workflow.steps) {
        expect(nativeContracts.some((t) => t.name === step.tool)).toBe(true);
        expect(step.uses[0]).toBeTruthy();
      }
      expect(workflow.approval).toBeTruthy();
      expect(workflow.failure).toBeTruthy();
    }
  });
  it("uses a real operation in the representative create call", () => {
    const args = toolDocs.find((t) => t.name === "create_block")!.args as any;
    expect(
      getOperation(args.sourceId, args.operationId).operation,
    ).toBeTruthy();
  });
  it("renders both the configured video and unconfigured placeholder", async () => {
    const placeholder = await renderToString(
      createSSRApp(DemoVideo, { url: "[YOUTUBE_URL]" }),
    );
    expect(placeholder).toContain("Recording planned");
    expect(placeholder).not.toContain("<iframe");
    const configured = await renderToString(
      createSSRApp(DemoVideo, { url: "https://youtu.be/abcdefghijk" }),
    );
    expect(configured).toContain(
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    );
    expect(configured).toContain('title="API Canvas narrated demo"');
    expect(configured).not.toContain("[YOUTUBE_URL]");
  });
  it("restricts doc execution to explicit local read-only tools", () => {
    for (const name of safeDocTools)
      expect(nativeContracts.find((t) => t.name === name)?.readOnly).toBe(true);
    for (const name of [
      "run_api",
      "test_data_source",
      "inspect_source",
      "discover_data_sources",
      "delete_block",
      "manage_dashboard",
      "execute_goal",
      "open_share_view",
    ])
      expect(safeDocTools.has(name)).toBe(false);
  });
  it("supports only bounded HTTPS YouTube embeds and leaves unknown links unconfigured", () => {
    expect(youtubeEmbed("[YOUTUBE_URL]")).toBeUndefined();
    expect(youtubeEmbed("https://youtu.be/abcdefghijk")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    );
    expect(youtubeEmbed("https://www.youtube.com/watch?v=abcdefghijk")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    );
    for (const value of [
      "javascript:alert(1)",
      "https://evil.example/watch?v=abcdefghijk",
      "http://youtube.com/watch?v=abcdefghijk",
      "https://youtube.com.evil.example/watch?v=abcdefghijk",
    ])
      expect(youtubeEmbed(value)).toBeUndefined();
  });
  it("provides metadata for direct routes and real branded image formats", () => {
    for (const path of ["/", "/webmcp", "/hackathon"])
      expect(pageMetadata(path).canonical).toContain(path);
    expect(routeFor("/webmcp/")).toBe("/webmcp");
    const ico = readFileSync("public/favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    const og = readFileSync("public/og-image.png");
    expect(og.readUInt32BE(16)).toBe(1200);
    expect(og.readUInt32BE(20)).toBe(630);
    expect(
      JSON.parse(readFileSync("public/site.webmanifest", "utf8")).start_url,
    ).toBe("/");
  });
  it("keeps the exact narration in markdown and within the recording word budget", () => {
    const words = script
      .map((s) => s.narration)
      .join(" ")
      .split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(368);
    expect(words).toBeLessThanOrEqual(425);
    const markdown = readFileSync("docs/demo-video-script.md", "utf8");
    for (const segment of script) expect(markdown).toContain(segment.narration);
  });
  it("bounds session output and redacts credentials without mutating the response", () => {
    const response = {
      raw: { secret: "private" },
      headers: { Authorization: "Bearer abc" },
      url: "https://example.com?api_key=secret",
      data: {
        password: "private",
        rows: Array.from({ length: 100 }, () => ({ name: "x".repeat(1000) })),
      },
    };
    recordToolResult("get_page_context", response);
    const result = JSON.stringify(latestToolResult.value);
    expect(result.length).toBeLessThan(30000);
    expect(result).not.toContain("private");
    expect(result).not.toContain("api_key=secret");
    expect(response.data.password).toBe("private");
  });
});
