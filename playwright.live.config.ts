import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testDir: "./tests/live",
  timeout: 120000,
  outputDir: "test-results-live",
  webServer: undefined,
  use: {
    ...config.use,
    baseURL: process.env.LIVE_URL ?? "https://api-canvas-bclonan.netlify.app",
  },
});
