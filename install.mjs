#!/usr/bin/env node
// PostPilot one-shot installer — cross-platform (Windows / macOS / Linux).
// Run with:  node install.mjs
// Installs all packages, generates the Prisma client, and prepares .env.local.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

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
if (existsSync(envPath)) {
  log(`✔ ${envPath} already exists — leaving it untouched`);
} else {
  writeFileSync(
    envPath,
    `# PostPilot environment — fill in DATABASE_URL, then run: npx pnpm dev\nDATABASE_URL=""\n`
  );
  log(`✔ Created ${envPath}`);
}

// 5 — Done: precise next steps
let dbSet = false;
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  dbSet = /DATABASE_URL="postgresql:\/\//.test(env) || /DATABASE_URL=postgresql:\/\//.test(env);
}

log("\n──────────────────────────────────────────────");
if (dbSet) {
  log("✅ Install complete. Start the app:");
  log("   npx pnpm dev");
  log("   → open the printed URL in your browser (usually http://localhost:3000)");
} else {
  log("✅ Install complete. TWO quick steps remain:");
  log("1) Edit .env.local — set DATABASE_URL to your Supabase connection string");
  log('   (Supabase → Connect button → Session pooler URI, with your real password)');
  log("2) Start the app:");
  log("   npx pnpm dev");
  log("   → open the printed URL in your browser (usually http://localhost:3000)");
}
log("──────────────────────────────────────────────\n");