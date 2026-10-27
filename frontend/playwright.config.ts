import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:8011", trace: "retain-on-failure" },
  webServer: {
    command:
      (process.platform === "win32"
        ? "..\\.venv\\Scripts\\python.exe"
        : "../.venv/bin/python") + " ../scripts/e2e_server.py",
    url: "http://127.0.0.1:8011/healthz",
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1050 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
