import { DATABASE_URL, prisma as postgresControl } from "@/lib/prisma";
import { createRequire } from "module";
import path from "path";
import { spawnSync } from "child_process";
import type { PrismaClient } from "@prisma/client";

/**
 * Deployment database mode:
 *  - "postgres": a DATABASE_URL (any flavor) is configured - all data on the
 *    configured Postgres (operator Supabase, or a workspace's BYO database
 *    via onboarding).
 *  - "local": no DATABASE_URL - everything lives on this computer in a
 *    SQLite file (data/postpilot.db). Zero accounts, zero connection strings.
 */
export type DbMode = "postgres" | "local";
export const RESOLVED_DB_MODE: DbMode = DATABASE_URL ? "postgres" : "local";
export const isLocalMode = () => RESOLVED_DB_MODE === "local";

let localClientSingleton: PrismaClient | null = null;

/**
 * Load the Local Mode SQLite client from the generated folder - WITHOUT
 * webpack static-bundling issues. createRequire resolves the real CommonJS
 * generated client at runtime; the cache is busted so a re-generated folder
 * (installed after first boot) is picked up on the next load.
 */
function requireGenClient(): { PrismaClient: new (opts: any) => PrismaClient } {
  const pkgJson = path.join(
    process.cwd(),
    "prisma",
    "generated",
    "client-local",
    "package.json",
  );
  const req = createRequire(pkgJson);
  const mainPath = req.resolve(".");
  delete (req.cache as Record<string, unknown>)[mainPath];
  return req(mainPath) as { PrismaClient: new (opts: any) => PrismaClient };
}

function createLocal(): PrismaClient {
  const mod = requireGenClient();
  return new mod.PrismaClient({
    datasources: { db: { url: "file:../data/postpilot.db" } },
    log: [],
  });
}

/** Install-time / boot-time local DB preparation (generate + push schema). */
export async function prepareLocalDb(): Promise<void> {
  const base = ["-y", "pnpm@latest", "exec", "prisma"];

  const gen = spawnSync(
    "npx",
    base.concat(["generate", "--schema", "prisma/schema.local.prisma"]),
    { stdio: "inherit", shell: true }
  );
  if (gen.status !== 0) throw new Error("prisma generate (local) failed");

  const push = spawnSync(
    "npx",
    base.concat(["db", "push", "--schema", "prisma/schema.local.prisma", "--skip-generate"]),
    { stdio: "inherit", shell: true }
  );
  if (push.status !== 0) throw new Error("prisma db push (local) failed");
}

export async function initLocalDb(): Promise<PrismaClient> {
  if (!localClientSingleton) {
    try {
      localClientSingleton = createLocal();
    } catch {
      // Stub still in place (pre-install) - prepare, then load the real client.
      await prepareLocalDb();
      localClientSingleton = createLocal();
    }
  }
  return localClientSingleton;
}

/** Synchronous accessor once the Local Mode client has been created at boot. */
export function localDbSync(): PrismaClient {
  if (!localClientSingleton) {
    throw new Error("Local database client not initialized - it is created at server boot");
  }
  return localClientSingleton;
}

/**
 * Bootstrap/control-plane client:
 *  - postgres mode: the shared control PrismaClient
 *  - local mode: the SQLite client for the local file
 * (Control-plane models: Agency, Session, GhLConnection, TokenEvent - in
 * local mode these all live in the same SQLite file.)
 */
export async function controlDb(): Promise<PrismaClient> {
  return isLocalMode() ? await initLocalDb() : postgresControl;
}
