// Foreground dev-server runner shared by every installer path.
// - spawns `pnpm dev` (via npx when pnpm is missing)
// - detects the printed localhost URL and opens it in the system browser
// - stays alive with the server; Ctrl+C stops both
import { spawn, exec } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("package.json")) {
  console.error("❌ Run this from the PostPilot project folder (where package.json is).");
  process.exit(1);
}

const log = (msg) => console.log(msg);

log("\n▸ Starting the dev server…");
log("  The app opens in your browser automatically when it's ready.");
log("  Keep this window open. Press Ctrl+C to stop.\n");

const IS_WIN = process.platform === "win32";
const dev = spawn(IS_WIN ? "npx.cmd" : "npx", ["-y", "pnpm@latest", "dev"], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true, // npx resolves through a shell shim on Windows; harmless elsewhere
});

let opened = false;

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      exec(`start "" "${url}"`);
    } else if (process.platform === "darwin") {
      exec(`open "${url.replace(/"/g, "")}"`);
    } else {
      exec(`xdg-open "${url.replace(/"/g, "")}"`);
    }
  } catch {
    log(`ℹ Open ${url} in your browser manually.`);
  }
}

function handleChunk(chunk) {
  process.stdout.write(chunk);
  if (opened) return;
  const m = String(chunk).match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
  if (m) {
    opened = true;
    const url = m[0];
    // give the compiler a moment so the first page load is instant-ish
    setTimeout(() => {
      log(`\n▸ Opening ${url} in your browser…\n`);
      openBrowser(url);
    }, 1500);
  }
}

dev.stdout.on("data", handleChunk);
dev.stderr.on("data", (c) => process.stderr.write(c));
dev.on("exit", (code) => {
  log(`\n⚠ Server stopped (code ${code ?? 0}). Restart with:  npx pnpm dev`);
  process.exit(code ?? 0);
});