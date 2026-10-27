import { test, expect, type Cookie } from "@playwright/test";

let cookies: Cookie[] = [];
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill("testing-only-password");
  await page.getByRole("button", { name: "Sign in to CloudDroid" }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace overview" }),
  ).toBeVisible();
  cookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ page, context }) => {
  await context.addCookies(cookies);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Workspace overview" }),
  ).toBeVisible();
});

async function navigate(page: any, name: string) {
  const mobile = page.getByRole("button", { name: "Open navigation" });
  if (await mobile.isVisible()) await mobile.click();
  await page
    .locator("nav")
    .getByRole("button", { name, exact: name !== "Profiles" })
    .click();
}

test("honest runtime status, all screens, no horizontal overflow", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByText("Local mode is active.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".profile-card")).toHaveCount(3);
  await page.screenshot({
    path: "../docs/screenshots/" + testInfo.project.name + "-dashboard.png",
    fullPage: true,
  });
  for (const screen of [
    "Profiles",
    "Android viewer",
    "Network",
    "Phone center",
    "Settings",
  ]) {
    await navigate(page, screen);
    await expect(
      page.getByRole("heading", { name: screen, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("create, label, route, archive, restore and delete a real persistent profile", async ({
  page,
}, testInfo) => {
  const name = "Browser profile " + testInfo.project.name;
  await page
    .getByRole("button", { name: "Create profile", exact: true })
    .click();
  await page.getByLabel("Display name").fill(name);
  await page
    .getByRole("button", { name: "Create independent profile" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await navigate(page, "Profiles");
  await expect(
    page.locator(".profile-card").filter({ hasText: name }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
  await page
    .getByLabel("Account label (user supplied)")
    .fill("Manual account label");
  await page.getByLabel("Recovery notes").fill("Private browser test note");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();
  await expect(page.getByText("Manual account label")).toBeVisible();
  await page
    .locator(".profile-card")
    .filter({ hasText: name })
    .getByRole("button", { name: "Open workspace" })
    .click();
  await page
    .getByRole("button", { name: "Start Android", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("/dev/kvm");
  await navigate(page, "Network");
  await page.getByLabel("Network route").selectOption("proxy");
  await page
    .getByLabel("Proxy URL", { exact: true })
    .fill("socks5://test:private-value@8.8.8.8:1080");
  await page.getByRole("button", { name: "Save network route" }).click();
  await expect(
    page.getByText("Current: socks5://8.8.8.8:1080.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeHidden();
  await navigate(page, "Profiles");
  await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
  await page
    .getByRole("button", { name: "Archive profile", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.locator(".profile-card").filter({ hasText: name }),
  ).toContainText("archived");
  await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
  await page
    .getByRole("button", { name: "Restore profile", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete profile", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.locator(".profile-card").filter({ hasText: name }),
  ).toHaveCount(0);
});

test("sign out protects subsequent API access", async ({ page, request }) => {
  const mobile = page.getByRole("button", { name: "Open navigation" });
  if (await mobile.isVisible()) await mobile.click();
  await page
    .getByRole("button", { name: "Administrator Private workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome to your workspace" }),
  ).toBeVisible();
  const response = await request.get("/api/profiles");
  expect(response.status()).toBe(401);
});
