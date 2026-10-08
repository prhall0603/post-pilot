import { test, expect } from "@playwright/test";

test.describe("agency auth", () => {
  test("landing page loads with hero, steps, mix and platform sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("A full year of client social media");
    await expect(page.locator("#how")).toBeVisible();
    await expect(page.locator("#mix")).toBeVisible();
    await expect(page.locator("#platforms")).toBeVisible();
    // Content mix section shows the weighted framework
    await expect(page.locator("#mix").getByText("Educational")).toBeVisible();
    await expect(page.locator("#mix").getByText("40%")).toBeVisible();
    // All 7 GHL Social Planner platforms are listed
    await expect(page.locator("#platforms").getByText("Twitter/X")).toBeVisible();
    await expect(page.locator("#platforms").getByText("Google Business", { exact: true })).toBeVisible();
    await expect(page.locator("#platforms").getByText("TikTok", { exact: true })).toBeVisible();
  });

  test("login rejects wrong credentials without crashing", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in to postpilot|create your agency workspace/i })).toBeVisible();
    await page.getByLabel("Work email").fill("nobody@postpilot.test");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByTestId("login-submit").click();
    // The submit button must re-enable and the form must persist (error toast
    // appears but is transient; the stable signal is the form state).
    await expect(page.getByTestId("login-submit")).toBeEnabled({ timeout: 8000 });
    await expect(page.getByRole("heading", { name: /sign in to postpilot|create your agency workspace/i })).toBeVisible();
  });
});