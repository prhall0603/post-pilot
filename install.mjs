#!/usr/bin/env node
// PostPilot one-shot installer — cross-platform (Windows / macOS / Linux).
// Run with:  node install.mjs
// Installs all packages, generates the Prisma client, then (optionally)
// configures DATABASE_URL and STARTS the app in the same run.
// Flags:  node install.mjs --start   → start immediately after install
//         node install.mjs --no-start → never prompt to start

import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const START_FLAG = process.argv.includes("--start");
const NO_START = process.argv.includes("--no-start");
const log = (msg) => console.log(msg);
const die = (msg) => {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
};

// `npx` is npx.cmd on Windows (needs a shell there); direct elsewhere —
// avoids the [DEP0190] shell-args deprecation warning on macOS/Linux.
const IS_WIN = process.platform === "win32";
const npx = (args, opts = {}) =>
  spawnSync(IS_WIN ? "npx.cmd" : "npx", args, {
    stdio: "inherit",
    ...(IS_WIN ? { shell: true } : {}),
    ...opts,
  });

log("\n🚀 PostPilot installer");

// 0 — must be run from inside the app folder
if (!existsSync("package.json")) {
  die("PostPilot files not found in this folder. Open the app folder first (example: cd post-pilot), then run:  node install.mjs --start");
}

// 1 — Node version check
const major = Number(process.versions.node.split(".")[0]);
if (Number.isNaN(major) || major < 18) {
  die(`Node.js 18.18+ is required (you have ${process.versions.node || "none"}). Install Node 20+ from https://nodejs.org and rerun:  node install.mjs`);
}
log(`✔ Node.js ${process.versions.node}`);

// 2 — Install all packages (pnpm via npx — no global installs needed)
log("\n▸ Installing all packages (this can take a few minutes)…");
const install = npx(["-y", "pnpm@latest", "install"]);
if (install.status !== 0) die("Package install failed — check the output above. Common cause: Git-for-Windows or network blocks; fix it and rerun.");
log("✔ Packages installed");

// 3 — Ensure the Prisma client exists. Prisma 6's postinstall hook already
// generated it during install; we regenerate with the PROJECT-LOCAL CLI only
// if needed. (Never fetch prisma@latest — v7 dropped the `generate` command.)
log("\n▸ Ensuring the Prisma client is generated…");
const gen = npx(["-y", "pnpm@latest", "exec", "prisma", "generate"]);
if (gen.status !== 0) {
  log("⚠ `prisma generate` returned an error — but if the install output above");
  log("  showed '✔ Generated Prisma Client', the app's client is ready anyway.");
} else {
  log("✔ Prisma client generated");
}

// 4 — Prepare .env.local (never overwrites an existing file)
const envPath = ".env.local";
if (!existsSync(envPath)) {
  writeFileSync(envPath, `# PostPilot environment — DATABASE_URL is filled in below or by hand\nDATABASE_URL=""\n`);
  log(`✔ Created ${envPath}`);
}

const readEnv = () => readFileSync(envPath, "utf8");
const dbIsSet = (env) => /DATABASE_URL="?postgresql:\/\//.test(env);

// 5 — Configure the database connection right here (if not yet set)
const rl = readline.createInterface({ input: stdin, output: stdout });
let dbReady = dbIsSet(readEnv());

if (!dbReady) {
  log("\n▸ The app needs the connection string of its Postgres database.");
  log("  Where to find it: Supabase dashboard → your project → green 'Connect' button");
  log("  → copy the 'Session pooler' URI → replace [YOUR-PASSWORD] with your real password.");
  const answer = (await rl.question("\nEnter the connection string now (or press Enter to set it later): ")).trim();
  if (answer) {
    if (!/^postgresql:\/\/|^postgres:\/\//i.test(answer)) {
      log("⚠ That does not look like a postgres:// connection string — skipping; set DATABASE_URL in .env.local by hand.");
    } else if (!/supabase\./i.test(answer)) {
      log("⚠ Note: host is not supabase.* — continuing anyway (any Postgres works).");
      const env = readEnv().replace(/DATABASE_URL=""/, `DATABASE_URL="${answer.replace(/"/g, "")}"`);
      writeFileSync(envPath, env);
      dbReady = dbIsSet(readEnv());
    } else {
      const env = readEnv().replace(/DATABASE_URL=""/, `DATABASE_URL="${answer.replace(/"/g, "")}"`);
      writeFileSync(envPath, env);
      dbReady = dbIsSet(readEnv());
    }
    if (dbReady) log("✔ DATABASE_URL saved to .env.local");
  } else {
    log("ℹ No problem — you can fill DATABASE_URL in .env.local any time; the installer will skip straight to start next run.");
  }
}

// 6 — Start the app (interactive prompt, or forced via --start)
if (NO_START) {
  rl.close();
  log("\n✅ Install complete (start skipped by --no-start). Start later with:  npx pnpm dev");
  process.exit(0);
}

const wantsStart = START_FLAG || (await (async () => {
  const q = dbReady
    ? "\nStart the app now? [Y/n] "
    : "\nStart the app now anyway (it will show a 'Database not connected' note until DATABASE_URL is set)? [y/N] ";
  const a = (await rl.question(q)).trim().toLowerCase();
  return dbReady ? a !== "n" : a === "y";
})());
rl.close();

if (wantsStart) {
  log("\n▸ Starting the dev server — keep this window open. Press Ctrl+C to stop.");
  log("  The app opens in your browser automatically once it's ready.\n");
  const dev = spawn(IS_WIN ? "npx.cmd" : "npx", ["-y", "pnpm@latest", "dev"], {
    stdio: ["inherit", "pipe", "pipe"],
    ...(IS_WIN ? { shell: true } : {}),
  });
  let opened = false;
  const openBrowser = (url) => {
    try {
      if (process.platform === "win32") {
        spawn("cmd", ["/c", "start", "", url], { shell: true, stdio: "ignore" }).unref();
      } else if (process.platform === "darwin") {
        spawn("open", [url], { stdio: "ignore" }).unref();
      } else {
        spawn("xdg-open", [url], { stdio: "ignore" }).unref();
      }
    } catch {
      /* user can open the printed URL manually */
    }
  };
  const onData = (chunk) => {
    process.stdout.write(chunk);
    if (opened) return;
    const m = String(chunk).match(/https?:\/\/localhost:\d+/);
    if (m) {
      opened = true;
      const url = m[0];
      // give Next a moment to finish booting before popping the browser
      setTimeout(() => {
        log(`\n▸ Opening ${url} in your browser…\n`);
        openBrowser(url);
      }, 1500);
    }
  };
  dev.stdout.on("data", onData);
  dev.stderr.on("data", (c) => process.stderr.write(c));
  dev.on("exit", (code) =>
    log(`\n⚠ Server stopped (code ${code ?? 0}). Start again any time with:  npx pnpm dev`)
  );
} else {
  log("\n✅ Install complete. Start any time with:");
  log("   npx pnpm dev");
  log("   → open the printed URL in your browser (usually http://localhost:3000)");
}