#!/usr/bin/env node
// PostPilot one-shot installer — cross-platform (Windows / macOS / Linux).
// Run with:  node install.mjs
// Installs all packages, generates the Prisma client, then (optionally)
// configures DATABASE_URL and STARTS the app in the same run.
// Flags:  node install.mjs --start   → start immediately after install
//         node install.mjs --no-start → never prompt to start

import { spawnSync } from "node:child_process";
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

log("\n🚀 PostPilot installer");

// 1 — Node version check
const major = Number(process.versions.node.split(".")[0]);
if (Number.isNaN(major) || major < 18) {
  die(`Node.js 18.18+ is required (you have ${process.versions.node || "none"}). Install Node 20+ from https://nodejs.org and rerun:  node install.mjs`);
}
log(`✔ Node.js ${process.versions.node}`);

// 2 — Install all packages (pnpm via npx — no global installs needed)
log("\n▸ Installing all packages (this can take a few minutes)…");
const install = spawnSync("npx", ["-y", "pnpm@latest", "install"], { stdio: "inherit", shell: true });
if (install.status !== 0) die("Package install failed — check the output above. Common cause: Git-for-Windows or network blocks; fix it and rerun.");
log("✔ Packages installed");

// 3 — Generate the Prisma client (schema → typed client)
log("\n▸ Generating the Prisma client…");
const gen = spawnSync("npx", ["-y", "prisma@latest", "generate"], { stdio: "inherit", shell: true });
if (gen.status !== 0) die("Prisma generate failed — check the output above and rerun.");
log("✔ Prisma client generated");

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
  log("  When it prints 'Ready', open the shown URL in your browser (usually http://localhost:3000).\n");
  const dev = spawnSync("npx", ["-y", "pnpm@latest", "dev"], { stdio: "inherit", shell: true });
  log(dev.status === 0 ? "\n✔ Server stopped cleanly." : `\n⚠ Server exited (code ${dev.status}). Rerun with:  npx pnpm dev`);
} else {
  log("\n✅ Install complete. Start any time with:");
  log("   npx pnpm dev");
  log("   → open the printed URL in your browser (usually http://localhost:3000)");
}