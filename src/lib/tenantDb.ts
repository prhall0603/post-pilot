import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { decrypt } from "@/lib/crypto";
import { prisma as controlPrisma, DATABASE_URL } from "@/lib/prisma";
import { installClientSchema } from "@/lib/schemaInstaller";

/**
 * Tenant database routing.
 *
 * Every workspace (agency) stores its content data either in the HOSTED
 * control database (the Dyad-provisioned Supabase project) or in the
 * workspace's OWN Supabase project (BYO) once the owner connects one during
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

if (!prismaSingletons.__ppControl) {
  prismaSingletons.__ppControl = controlPrisma;
}
if (!prismaSingletons.__ppTenants) prismaSingletons.__ppTenants = new Map();
if (!prismaSingletons.__ppAls) prismaSingletons.__ppAls = new AsyncLocalStorage();

/** The control-plane (hosted) Prisma client — auth/session/agency registry. */
export const prisma = prismaSingletons.__ppControl;
const tenantClients = prismaSingletons.__ppTenants!;
const als = prismaSingletons.__ppAls!;

export interface TenantScope {
  agencyId: string;
  dbMode: "HOSTED" | "BYO";
  dsUrl: string; // resolved datasource URL for this request
}

/** Resolve an agency's tenant datasource URL from the control plane. */
export async function resolveTenantUrl(agencyId: string): Promise<TenantScope> {
  const agency = await controlPrisma.agency.findUniqueOrThrow({
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

/** Get (or create) a cached PrismaClient for a tenant URL. */
export function tenantClient(scope: TenantScope): PrismaClient {
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
 * Run `fn` with all `db.*` calls routed to the agency's tenant database.
 * Falls back to control db when no scope is set (non-auth bootstrap paths).
 */
export async function withTenantDb<T>(agencyId: string, fn: () => Promise<T>): Promise<T> {
  const scope = await resolveTenantUrl(agencyId);
  if (scope.dbMode === "BYO") await installClientSchema(scope.dsUrl);
  return als.run(scope, fn);
}

/** Read the current scope (or null outside one). */
export function currentScope(): TenantScope | null {
  return als.getStore() ?? null;
}

/**
 * The `db` export: every route keeps its existing `db.client...` calls.
 * Delegates to the tenant client when inside withTenantDb(), else the
 * control client (bootstrap/registry paths).
 */
export const db = new Proxy({} as PrismaClient, {
  get(_t, prop, receiver) {
    const scope = als.getStore();
    const client = scope ? tenantClient(scope) : prisma;
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;

/** Force-drop a tenant connection (e.g. after a failed BYO switch). */
export function evictTenantClient(agencyId: string): void {
  const client = tenantClients.get(agencyId);
  if (client) {
    tenantClients.delete(agencyId);
    void client.$disconnect().catch(() => {});
  }
}