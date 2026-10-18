import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3000";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error("E2E_PORT must be a port between 1024 and 65535");
}
const baseURL = `http://localhost:${port}`;
const serverCommand = process.env.E2E_PRODUCTION === "1" ? "npm start" : "npm run dev";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1050 } },
    },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: `${serverCommand} -- --port ${port}`,
    url: baseURL,
    env: {
      ADMIN_PASSWORD: "e2e-only-password-never-use-this-in-production",
      BLOB_READ_WRITE_TOKEN: "e2e-only-not-a-real-blob-token",
      SESSION_SECRET: "e2e-only-session-secret-never-use-in-production",
      GITHUB_CLIENT_ID: "e2e-only-client-id",
      GITHUB_CLIENT_SECRET: "e2e-only-client-secret",
      APP_ORIGIN: baseURL,
    },
    reuseExistingServer: !process.env.CI && !process.env.E2E_PORT,
    timeout: 120000,
  },
});
