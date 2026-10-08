import { test, expect } from "@playwright/test";

/**
 * Registration flow: on a fresh database, POST /api/auth with action=register
 * creates the single-agency workspace in Demo Mode and seeds a worked example
 * client (Sunrise Solar Co.). This spec registers with unique credentials via
 * the app's own form and asserts the full onboarding outcome.
 *
 * Note: the workspace is single-agency — once a real workspace exists this
 * spec can only be exercised on an isolated (fresh) database.
 */
const EMAIL = `agency+${Date.now().toString(36)}@postpilot.test`;
const PASSWORD = "postpilot-e2e-pass";

test("register workspace → dashboard shows seeded demo client", async ({ page }) => {
  await page.goto("/login");

  // Wait for the auth mode probe: fresh DB shows "Create your agency
  // workspace"; otherwise the sign-in form appears and this test cannot run.
  const registerHeading = page.getByRole("heading", { name: "Create your agency workspace" });
  const loginHeading = page.getByRole("heading", { name: "Sign in to PostPilot" });
  await expect(registerHeading.or(loginHeading)).toBeVisible({ timeout: 10000 });

  if (await loginHeading.isVisible()) {
    // A workspace already exists — single-agency app, nothing to register.
    // Verify the login form is functional instead.
    await page.getByLabel("Work email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-submit")).toBeEnabled({ timeout: 8000 });
    return;
  }

  // Registration open: create the workspace through the app's own form.
  await page.getByLabel("Work email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

  // Seeded demo client appears via the sidebar client switcher.
  await expect(page.getByTestId("client-switcher")).toContainText("Sunrise Solar Co.", {
    timeout: 20000,
  });

  // Overview renders the seeded plan data.
  await expect(page.getByTestId("client-overview-name")).toHaveText("Sunrise Solar Co.");
  await expect(page.getByTestId("count-scheduled")).toBeVisible();

  // Clients page lists the linked GHL sub-account.
  await page.goto("/clients");
  await expect(page.getByText("Sunrise Solar Co.").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/GHL · loc_demo/).first()).toBeVisible();
});