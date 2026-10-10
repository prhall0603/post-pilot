import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { decrypt } from "@/lib/crypto";
import { prisma as postgresControl } from "@/lib/prisma";
import { controlDb, isLocalMode, localDbSync } from "@/lib/dbMode";
import { installClientSchema } from "@/lib/schemaInstaller";

/**
 * Tenant database routing.
 *
 * Every workspace (agency) stores its data either on the configured
 * database (HOSTED: the operator's Postgres / the local SQLite file) or in
 * the workspace's OWN Supabase project (BYO) once connected during
 * onboarding.
 *
 * A delegating proxy resolves the tenant connection at call time using an
 * AsyncLocalStorage scope set by withTenantDb() — so routes keep calling
 * `db.client.findMany(...)` and transparently hit the right database.
 */

const prismaSingletons = globalThis as unknown as {
  __ppControl?: PrismaClient;
  __ppTenants?: Map<string, PrismaClient>;
  __ppAls?: AsyncLocalStorage<TenantScope>;
};

if (!prismaSingletons.__ppControl) prismaSingletons.__ppControl = postgresControl;
if (!prismaSingletons.__ppTenants) prismaSingletons.__ppTenants = new Map();
if (!prismaSingletons.__ppAls) prismaSingletons.__ppAls = new AsyncLocalStorage();

/** The control-plane Prisma client (postgres mode) — see dbMode.ts for local. */
export const prisma = prismaSingletons.__ppControl;
const tenantClients = prismaSingletons.__ppTenants!;
const als = prismaSingletons.__ppAls!;

export interface TenantScope {
  agencyId: string;
  dbMode: "HOSTED" | "BYO" | "LOCAL";
  dsUrl: string; // resolved datasource URL for this request
}

/** Resolve an agency's tenant datasource from the control plane. */
export async function resolveTenantUrl(agencyId: string): Promise<TenantScope> {
  if (isLocalMode()) {
    // Single local workspace: everything on this computer.
    return { agencyId, dbMode: "LOCAL", dsUrl: "file:../data/postpilot.db" };
  }
  const control = await controlDb();
  const agency = await control.agency.findUniqueOrThrow({
    where: { id: agencyId },
    select: { id: true, dbMode: true, dbUrlEnc: true },
  });
  if (agency.dbMode === "BYO" && agency.dbUrlEnc) {
    const url = decrypt(agency.dbUrlEnc);
    if (!url) throw new Error("Stored BYO database connection could not be decrypted");
    return { agencyId, dbMode: "BYO", dsUrl: url };
  }
  return { agencyId, dbMode: "HOSTED", dsUrl: "" };
}

/** Get (or create) a cached PrismaClient for a tenant scope. */
export function tenantClient(scope: TenantScope): PrismaClient {
  if (scope.dbMode === "LOCAL") return localDbSync();
  if (scope.dbMode === "HOSTED") return prisma;
  const key = scope.agencyId;
  let client = tenantClients.get(key);
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: scope.dsUrl } }, log: [] });
    tenantClients.set(key, client);
  }
  return client;
}

/**
 * Run `fn` with all `db.*` calls routed to the agency's database.
 * Local mode → the SQLite client; HOSTED → control client; BYO → cached
 * Postgres client for the stored connection string.
 */
export async function withTenantDb<T>(
  agencyId: string,
  fn: (client: PrismaClient) => Promise<T>
): Promise<T> {
  const scope = await resolveTenantUrl(agencyId);
  if (scope.dbMode === "BYO") await installClientSchema(scope.dsUrl);
  return als.run(scope, () => fn(tenantClient(scope)));
}

/** Read the current scope (or null outside one). */
export function currentScope(): TenantScope | null {
  return als.getStore() ?? null;
}

/**
 * The `db` export: routes keep their existing `db.client...` calls.
 * Delegates to the tenant client when inside withTenantDb(), else the
 * control client (bootstrap/registry paths).
 */
export const db = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const scope = als.getStore();
    const client = scope
      ? tenantClient(scope)
      : controlClientSync();
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;

import { localDbSync as localDbSyncNamed } from "@/lib/dbMode";
function controlClientSync(): PrismaClient {
  return isLocalMode() ? localDbSyncNamed() : prisma;
}

/** Force-drop a tenant connection (e.g. after a failed BYO switch). */
export function evictTenantClient(agencyId: string): void {
  const client = tenantClients.get(agencyId);
  if (client) {
    tenantClients.delete(agencyId);
    void client.$disconnect().catch(() => {});
  }
}