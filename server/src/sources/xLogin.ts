import { chromium } from "playwright";

/**
 * One-time X login → saves a Playwright storageState the XSource reuses.
 *
 *   cd server && npm run x-login
 *
 * Opens a real browser window. Log into X (a burner account is fine — read-only),
 * wait until your home timeline loads, then press ENTER in this terminal. The
 * session is written to X_STORAGE_STATE (default ./x-state.json) and the XSource
 * picks it up automatically on the next stream you add.
 */
const STATE_PATH = process.env.X_STORAGE_STATE || "x-state.json";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("https://x.com/login");

  console.log("\n────────────────────────────────────────────────────────");
  console.log(" [x-login] Log into X in the window that just opened.");
  console.log(" When your timeline is visible, press ENTER here to save.");
  console.log("────────────────────────────────────────────────────────\n");

  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));

  await ctx.storageState({ path: STATE_PATH });
  console.log(`\n[x-login] ✅ Saved session → ${STATE_PATH}`);
  console.log("[x-login] Restart the server and add an X post/broadcast URL.\n");
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[x-login] failed:", e);
  process.exit(1);
});
