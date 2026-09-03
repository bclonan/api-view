import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../netlify/functions/unsplash";
import { openCollections } from "../../src/api/providers/open-collections";
import {
  inspectCapability,
  searchCapabilities,
} from "../../src/api/capabilities";
import { normalize } from "../../src/runtime/normalize";
import {
  invokeOperation,
  normalizeError,
  validateOperationArguments,
} from "../../src/runtime/invoke";
import { imageCredits } from "../../src/runtime/imageCredits";
import { recoveryFor } from "../../src/runtime/outcomes";

const photo = {
  id: "photo-example",
  alt_description: "A supplied photo",
  urls: {
    small: "https://images.unsplash.com/photo-example?ixid=original&width=400",
    regular:
      "https://images.unsplash.com/photo-example?ixid=original&width=1000",
  },
  user: {
    name: "Test photographer",
    links: { html: "https://unsplash.com/@example" },
  },
  links: { html: "https://unsplash.com/photos/photo-example" },
};
const search = (query = "query=Baltimore&per_page=2") =>
  new Request(`https://canvas.example/.netlify/functions/unsplash?${query}`);
afterEach(() => vi.unstubAllGlobals());

describe("open collection catalog", () => {
  it("discovers key-required providers without hiding them, and respects explicit no-auth filtering", () => {
    expect(searchCapabilities("Unsplash")[0].sourceId).toBe("unsplash");
    expect(
      searchCapabilities("Unsplash", { noAuthOnly: true }).some(
        (s) => s.sourceId === "unsplash",
      ),
    ).toBe(false);
    expect(inspectCapability("unsplash", "search")).toMatchObject({
      authentication: "api-key",
      keySetup: { environmentVariable: "UNSPLASH_ACCESS_KEY" },
    });
  });
  it.each(openCollections)(
    "validates and normalizes the $id sample without changing its raw data",
    (api) => {
      for (const operation of api.operations) {
        const { args, missing } = validateOperationArguments(
          operation,
          operation.capability!.examples[0].arguments,
        );
        expect(missing).toEqual([]);
        const raw = operation.sample(args),
          before = JSON.stringify(raw);
        const result = normalize(raw, operation, api.id, "sample");
        expect(Array.isArray(result.data)).toBe(true);
        expect(JSON.stringify(raw)).toBe(before);
        expect(new URL(operation.buildUrl(args)).protocol).toBe("https:");
      }
    },
  );
  it("keeps original image URLs and credit links when normalizing Unsplash", () => {
    const operation = openCollections[0].operations[0];
    const result = normalize(
      { results: [photo] },
      operation,
      "unsplash",
      "live",
    );
    const row = (result.data as any[])[0];
    expect(row.image_url).toBe(photo.urls.small);
    expect(row.image_credit_url).toContain("utm_source=api_canvas");
    expect(row.image_source_url).toContain("utm_medium=referral");
    expect(imageCredits([row]).get(photo.urls.small)).toMatchObject({
      name: "Test photographer",
      source: "Unsplash",
    });
    expect(
      imageCredits([{ ...row, image_credit_url: "javascript:alert(1)" }]).get(
        photo.urls.small,
      )?.authorUrl,
    ).toBeUndefined();
  });
  it("treats empty results as empty and malformed collections as errors", () => {
    const cases = [
      ["unsplash", { results: [] }],
      ["wikimedia-commons", { batchcomplete: true }],
      ["gbif", { results: [] }],
      ["inaturalist", { results: [] }],
      ["eonet", { events: [] }],
      ["nws-alerts", { features: [] }],
      ["nobel-prize", { nobelPrizes: [] }],
    ] as const;
    for (const [id, payload] of cases) {
      const operation = openCollections.find((a) => a.id === id)!.operations[0];
      expect(operation.extract(payload)).toEqual([]);
      expect(() => operation.extract({ unexpected: true })).toThrow();
    }
  });
  it("handles the Met's null ID list for zero search results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ total: 0, objectIDs: null })),
    );
    const api = openCollections.find((a) => a.id === "met-museum")!;
    const result = await invokeOperation(
      api,
      api.operations[0],
      { q: "nomatch", limit: 2 },
      "live",
      undefined,
      true,
    );
    expect(result.rawResponse).toEqual({ total: 0, objectIDs: null });
    expect(result.result.data).toEqual([]);
  });
  it("retains a key setup failure in the UI/WebMCP error contract", async () => {
    vi.stubGlobal("Netlify", { env: { get: () => undefined } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => handler(search())),
    );
    try {
      await invokeOperation(
        openCollections[0],
        openCollections[0].operations[0],
        { query: "Baltimore" },
        "live",
        undefined,
        true,
      );
      expect.unreachable();
    } catch (error) {
      expect(normalizeError(error)).toMatchObject({
        code: "authentication-required",
        title: "Unsplash needs an Access Key",
      });
      expect(recoveryFor(normalizeError(error))).toMatchObject({
        retryable: false,
      });
    }
  });
});

describe("Unsplash server function", () => {
  it("does not fetch when a key is missing or inputs are invalid", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("Netlify", { env: { get: () => undefined } });
    expect((await handler(search())).status).toBe(503);
    for (const query of [
      "query=x&url=https://example.com",
      "query=x&client_id=secret",
      "query=x&per_page=21",
      "query=x&page=0",
      "query=x&orientation=invalid",
      "query=x&query=y",
      "query=",
    ])
      expect((await handler(search(query))).status).toBe(400);
    expect(
      (await handler(new Request(search().url, { method: "POST" }))).status,
    ).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends a confidential header only to the fixed upstream and preserves photo data", async () => {
    vi.stubGlobal("Netlify", { env: { get: () => "test-server-key" } });
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ total: 1, results: [photo] }));
    vi.stubGlobal("fetch", fetch);
    const result = await handler(search());
    const [url, init] = fetch.mock.calls[0];
    expect(url.origin).toBe("https://api.unsplash.com");
    expect(String(url)).not.toContain("test-server-key");
    expect(init.headers.Authorization).toBe("Client-ID test-server-key");
    expect(init.redirect).toBe("error");
    expect(await result.json()).toEqual({ total: 1, results: [photo] });
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each([401, 403, 429, 500])(
    "returns an actionable HTTP %s without reflecting upstream secrets",
    async (status) => {
      vi.stubGlobal("Netlify", { env: { get: () => "test-server-key" } });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("test-server-key", { status })),
      );
      const response = await handler(search());
      expect(response.status).toBe(status);
      const result = await response.json();
      expect(result.error.message).toBeTruthy();
      expect(JSON.stringify(result)).not.toContain("test-server-key");
      if (status === 429)
        expect(response.headers.get("Retry-After")).toBe("3600");
    },
  );
  it.each([
    new TypeError("network secret"),
    new SyntaxError("body secret"),
    new DOMException("timed out", "TimeoutError"),
  ])(
    "handles a transport failure without leaking its message",
    async (error) => {
      vi.stubGlobal("Netlify", { env: { get: () => "test-server-key" } });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
      const response = await handler(search());
      expect([502, 504]).toContain(response.status);
      expect(await response.text()).not.toContain("secret");
    },
  );
  it("rejects an unexpected response instead of returning made-up photos", async () => {
    vi.stubGlobal("Netlify", { env: { get: () => "test-server-key" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ unexpected: true })),
    );
    expect((await handler(search())).status).toBe(502);
  });
});
