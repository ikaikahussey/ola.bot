import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:4173",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npm run build && NODE_ENV=production PORT=4173 LOG_DIR=test-results/logs npx tsx server/index.ts",
    url: "http://localhost:4173/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
