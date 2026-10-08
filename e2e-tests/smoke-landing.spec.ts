import { test, expect } from "@playwright/test";

/** Decisive smoke: the server answers and the landing page visibly renders. */
test("server is reachable and the landing page renders", async ({ page }) => {
  await page.goto("/", { timeout: 30000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A full year of client social media",
    { timeout: 15000 }
  );
  await expect(page.getByRole("link", { name: "Open workspace" })).toBeVisible();
});