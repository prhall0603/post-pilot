import { test, expect } from "@playwright/test";

test.describe("agency auth", () => {
  test("landing page loads with hero, steps, mix and platform sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("A full year of client social media");
    await expect(page.locator("#how")).toBeVisible();
    await expect(page.locator("#mix")).toBeVisible();
    await expect(page.locator("#platforms")).toBeVisible();
    await expect(page.locator("#mix").getByText("Educational")).toBeVisible();
    await expect(page.locator("#mix").getByText("40%")).toBeVisible();
    await expect(page.locator("#platforms").getByText("Twitter/X")).toBeVisible();
    await expect(page.locator("#platforms").getByText("Google Business", { exact: true })).toBeVisible();
    await expect(page.locator("#platforms").getByText("TikTok", { exact: true })).toBeVisible();
  });

  test("login page surfaces a distinct state (db-missing banner or live form)", async ({ page }) => {
    await page.goto("/login");
    // The login page either renders the auth form (DB reachable) or the
    // explicit "Database not connected" banner (DB unreachable). Both are
    // valid, deliberate UI states — assert exactly one of them, quickly.
    const formHeading = page.getByRole("heading", { name: /sign in to postpilot|create your agency workspace/i });
    const dbBanner = page.getByRole("heading", { name: "Database not connected" });
    await expect(formHeading.or(dbBanner)).toBeVisible({ timeout: 15000 });
  });
});