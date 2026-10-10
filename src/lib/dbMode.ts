import { DATABASE_URL, prisma as postgresControl } from "@/lib/prisma";
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

/*
 * Runtime-only dynamic import - INVISIBLE to webpack (new Function wrapper),
 * so no node builtins ever enter bundled graphs. Resolves relative to the
 * real filesystem (absolute URLs), never the compiled bundle location.
 */
function dynamicImport(s: string): Promise<any> {
  return new Function("s", "return import(s)")(s);
}

async function loadBuiltin(name: string): Promise<any> {
  const mod = await dynamicImport(name);
  return mod.default ? Object.assign(mod.default, mod) : mod;
}

function genIndexPath(): string {
  return (process.cwd().replace(/\\/g, "/") + "/prisma/generated/client-local/index.js");
}

/*
 * Load the generated Local Mode client through createRequire (real Node
 * require, not webpack's) - with a cache-bust so an installer-regenerated
 * folder is picked up on the next load.
 */
async function requireGenClient(): Promise<{ PrismaClient: new (opts: any) => PrismaClient }> {
  const nodeModule = await loadBuiltin("module");
  const req = nodeModule.createRequire(genIndexPath());
  delete req.cache[genIndexPath()];
  return req(genIndexPath());
}

async function createLocal(): Promise<PrismaClient> {
  const mod = await requireGenClient();
  const Ctor = mod.PrismaClient;
  return new Ctor({
    datasources: { db: { url: "file:../data/postpilot.db" } },
    log: [],
  });
}

/** Install-time / boot-time local DB preparation (generate + push schema). */
export async function prepareLocalDb(): Promise<void> {
  const childProcess = await loadBuiltin("child_process");
  const base = ["-y", "pnpm@latest", "exec", "prisma"];

  const gen = childProcess.spawnSync(
    "npx",
    base.concat(["generate", "--schema", "prisma/schema.local.prisma"]),
    { stdio: "inherit", shell: true }
  );
  if (gen.status !== 0) throw new Error("prisma generate (local) failed");

  const push = childProcess.spawnSync(
    "npx",
    base.concat(["db", "push", "--schema", "prisma/schema.local.prisma", "--skip-generate"]),
    { stdio: "inherit", shell: true }
  );
  if (push.status !== 0) throw new Error("prisma db push (local) failed");
}

export async function initLocalDb(): Promise<PrismaClient> {
  if (!localClientSingleton) {
    try {
      localClientSingleton = await createLocal();
    } catch (e) {
      if (!/not prepared/i.test(String(e instanceof Error ? e.message : e))) throw e;
      // Stub still in place (pre-install) - prepare, then load the real client.
      await prepareLocalDb();
      localClientSingleton = await createLocal();
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
