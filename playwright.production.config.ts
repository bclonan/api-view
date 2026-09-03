import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  webServer: undefined,
  use: {
    ...config.use,
    baseURL: process.env.LIVE_URL ?? "https://api-canvas-bclonan.netlify.app",
  },
});
