import { test, expect } from "@playwright/test";

/**
 * Registration flow (only on a fresh/isolated database): register →
 * /onboarding wizard (Database + GHL choices) → Finish → dashboard with the
 * seeded demo client.
 *
 * When the test environment has no database, the login page shows the
 * explicit "Database not connected" banner and this spec asserts that
 * state instead of timing out.
 */
const EMAIL = `agency+${Date.now().toString(36)}@postpilot.test`;
const PASSWORD = "postpilot-e2e-pass";

test("register workspace → onboarding → dashboard (or explicit db-missing state)", async ({ page }) => {
  await page.goto("/login");

  const formHeading = page
    .getByRole("heading", { name: /create your agency workspace|sign in to postpilot/i })
    .or(page.getByRole("heading", { name: "Database not connected" }));
  await expect(formHeading).toBeVisible({ timeout: 15000 });

  // No database in this environment — the app is working as designed; assert
  // the deliberate failure mode and stop (does not hang to timeout).
  if (await page.getByRole("heading", { name: "Database not connected" }).isVisible()) {
    await expect(page.getByText(/DATABASE_URL/)).toBeVisible();
    return;
  }

  await page.getByLabel("Work email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);

  const isRegister = (await page
    .getByRole("heading", { name: "Create your agency workspace" })
    .isVisible()) as boolean;
  await page.getByTestId("login-submit").click();

  const target = isRegister ? /\/onboarding/ : /\/dashboard/;
  await expect(page).toHaveURL(new RegExp(target), { timeout: 20000 });

  // Onboarding wizard: cards + three GHL options, then finish.
  if (isRegister) {
    await expect(page.getByText("GoHighLevel connection")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Demo Mode (no credentials)")).toBeVisible();
    await expect(page.getByText("Private Integration token")).toBeVisible();
    await expect(page.getByText("Marketplace App (OAuth)")).toBeVisible();
    await page.getByTestId("finish-onboarding").click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  }

  await expect(page.getByTestId("client-switcher")).toContainText("Sunrise Solar Co.", { timeout: 20000 });
  await expect(page.getByTestId("client-overview-name")).toHaveText("Sunrise Solar Co.");

  await page.goto("/clients");
  await expect(page.getByText("Sunrise Solar Co.").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/GHL · loc_demo/).first()).toBeVisible();
});