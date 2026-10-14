import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.mjs",
  globalTeardown: "./e2e/global-teardown.mjs",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [["line"]],
  projects: [{
    name: "chromium",
    use: {
      browserName: "chromium",
      ignoreHTTPSErrors: false,
      launchOptions: {
        args: [
          "--no-proxy-server",
          "--host-resolver-rules=MAP store.m52g14.test 127.0.0.1,MAP api.m52g14.test 127.0.0.1,MAP evil.m52g14.test 127.0.0.1,MAP host.docker.internal 127.0.0.1"
        ]
      }
    }
  }]
});
