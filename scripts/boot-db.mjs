// Boot database preparation/maintenance - runs OUTSIDE webpack (spawned by
// instrumentation as a plain Node script), so it can use Node builtins and
// Prisma clients freely.
//
// Modes:
//  - postgres: DATABASE_URL (or SUPABASE_DB_URL/POSTGRES_URL/POSTGRESQL_URL/
//    DATABASE_URL_UNPOOLED) configured - ensure control schema matches client
//  - local: none set - SQLite file on this computer (data/postpilot.db):
//    generate the local client + push schema (idempotent)

import { PrismaClient } from "@prisma/client";
import { mkdirSync, existsSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

const FALLBACK_VARS = [
  process.env.DATABASE_URL,
  process.env.SUPABASE_DB_URL,
  process.env.POSTGRES_URL,
  process.env.POSTGRESQL_URL,
  process.env.DATABASE_URL_UNPOOLED,
];
const DATABASE_URL = FALLBACK_VARS.find(Boolean) || "";

const isLocalMode = () => !DATABASE_URL;
const IS_WIN = process.platform === "win32";
const npx = (args) =>
  spawnSync(IS_WIN ? "npx.cmd" : "npx", ["-y", "pnpm@latest", "exec", "prisma"].concat(args), {
    stdio: "inherit",
    ...(IS_WIN ? { shell: true } : {}),
  });

const log = (msg) => console.log("[postpilot-boot] " + msg);

const CONTROL_SCHEMA_SQL = [
  "DO $$ BEGIN CREATE TYPE \"PostStatus\" AS ENUM ('DRAFT','APPROVED','SCHEDULED','FAILED','POSTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
  "DO $$ BEGIN CREATE TYPE \"PlanStatus\" AS ENUM ('NOT_GENERATED','GENERATING','GENERATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
  "DO $$ BEGIN CREATE TYPE \"GhlMode\" AS ENUM ('DEMO','LIVE','PIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
  "CREATE TABLE IF NOT EXISTS agency (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, \"passwordHash\" TEXT NOT NULL, \"demoMode\" BOOLEAN NOT NULL DEFAULT true, \"dbMode\" TEXT NOT NULL DEFAULT 'HOSTED', \"dbUrlEnc\" TEXT, \"dbLabel\" TEXT, \"schemaInstalled\" BOOLEAN NOT NULL DEFAULT true, \"onboarded\" BOOLEAN NOT NULL DEFAULT false, \"createdAt\" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, \"updatedAt\" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);",
  "ALTER TABLE agency ADD COLUMN IF NOT EXISTS \"dbMode\" TEXT NOT NULL DEFAULT 'HOSTED';",
  "ALTER TABLE agency ADD COLUMN IF NOT EXISTS \"dbUrlEnc\" TEXT;",
  "ALTER TABLE agency ADD COLUMN IF NOT EXISTS \"dbLabel\" TEXT;",
  "ALTER TABLE agency ADD COLUMN IF NOT EXISTS \"schemaInstalled\" BOOLEAN NOT NULL DEFAULT true;",
  "ALTER TABLE agency ADD COLUMN IF NOT EXISTS \"onboarded\" BOOLEAN NOT NULL DEFAULT false;",
  "ALTER TABLE agency ADD COLUMN IF NOT EXISTS \"createdAt\" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;",
  "ALTER TABLE agency ADD COLUMN IF NOT EXISTS \"updatedAt\" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;",
  "CREATE TABLE IF NOT EXISTS session (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), \"tokenHash\" TEXT UNIQUE NOT NULL, \"agencyId\" UUID NOT NULL, \"createdAt\" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, \"expiresAt\" TIMESTAMPTZ NOT NULL);",
  "CREATE TABLE IF NOT EXISTS ghlconnection (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), \"agencyId\" UUID UNIQUE NOT NULL, mode \"GhlMode\" NOT NULL DEFAULT 'DEMO', \"clientId\" TEXT, \"clientSecretEnc\" TEXT, \"accessTokenEnc\" TEXT, \"refreshTokenEnc\" TEXT, \"tokenType\" TEXT NOT NULL DEFAULT 'Agency', \"expiresAt\" TIMESTAMPTZ, scope TEXT, \"locationId\" TEXT, \"userId\" TEXT, \"lastRefreshedAt\" TIMESTAMPTZ, \"lastError\" TEXT, \"connectedAt\" TIMESTAMPTZ, \"updatedAt\" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);",
  "CREATE TABLE IF NOT EXISTS tokenevent (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), \"agencyId\" UUID NOT NULL, kind TEXT NOT NULL, detail TEXT, \"createdAt\" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);",
  "CREATE INDEX IF NOT EXISTS session_agencyId_idx ON session (\"agencyId\");",
  "CREATE INDEX IF NOT EXISTS tokenevent_agencyId_createdAt_idx ON tokenevent (\"agencyId\", \"createdAt\");",
];

async function ensurePostgres() {
  const client = new PrismaClient({ datasources: { db: { url: DATABASE_URL } }, log: [] });
  try {
    for (const sql of CONTROL_SCHEMA_SQL) {
      await client.$executeRawUnsafe(sql).catch(() => {});
    }
    log("postgres control schema ensured");
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

async function ensureLocal() {
  const root = process.cwd();
  mkdirSync(path.join(root, "data"), { recursive: true });
  const gen = npx(["generate", "--schema", "prisma/schema.local.prisma"]);
  if (gen.status !== 0 && !existsSync(path.join(root, "prisma", "generated", "client-local", "index.js"))) {
    throw new Error("local client generate failed");
  }
  const push = npx(["db", "push", "--schema", "prisma/schema.local.prisma", "--skip-generate"]);
  if (push.status !== 0) throw new Error("local db push failed");
  log("local sqlite schema OK (data/postpilot.db)");
}

async function main() {
  if (isLocalMode()) {
    log("Local Mode - data stays on this computer (data/postpilot.db)");
    await ensureLocal();
  } else {
    log("database mode: postgres");
    await ensurePostgres();
  }
  log("boot OK");
}

main().then(
  () => process.exit(0),
  (e) => {
    log("FAILED: " + (e instanceof Error ? String(e.message).slice(0, 300) : e));
    process.exit(1);
  }
);
